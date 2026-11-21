#!/usr/bin/env python3
"""CPU-only regression tests for Blender scale math and finalizer contract gating."""
import contextlib
import importlib.util
import io
import math
import os
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]


def load_module(name, path, extra_modules=None):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    with patch.dict(sys.modules, extra_modules or {}):
        spec.loader.exec_module(module)
    return module


_bpy_stub = types.ModuleType("bpy")
_mathutils_stub = types.ModuleType("mathutils")
_mathutils_stub.Vector = tuple
postprocess = load_module(
    "postprocess_character_under_test",
    ROOT / "scripts/blender/postprocess_character.py",
    {"bpy": _bpy_stub, "mathutils": _mathutils_stub},
)
finalizer = load_module("finalize_assets_under_test", ROOT / "scripts/comfy/finalize_assets.py")


class CharacterPipelineContractTest(unittest.TestCase):
    def test_scale_ratio_preserves_imported_scale_and_reaches_target_height(self):
        imported_scale = (0.839976, 0.839976, 0.839976)
        imported_height = 1.679953
        target_height = 1.72

        result = postprocess.normalized_scale(imported_scale, imported_height, target_height)
        recovered_height = imported_height * result[2] / imported_scale[2]

        self.assertAlmostEqual(recovered_height, target_height, places=9)
        self.assertAlmostEqual(result[0] / result[2], 1.0, places=9)

    def test_scale_ratio_preserves_axis_proportions_and_non_character_size(self):
        result = postprocess.normalized_scale((0.5, 1.0, 1.5), 2.0, 3.0)
        self.assertEqual(result, (0.75, 1.5, 2.25))
        self.assertEqual(postprocess.normalized_scale((0.5, 1.0, 1.5), 2.0, 0), (0.5, 1.0, 1.5))
        self.assertEqual(postprocess.normalized_scale((0.5, 1.0, 1.5), 0, 3), (0.5, 1.0, 1.5))

    def test_character_vertical_axis_supports_y_up_and_z_up_glbs(self):
        self.assertEqual(postprocess.vertical_axis((0.728, 1.165, 0.257)), 1)
        # Blender's glTF importer exposes this Hunyuan Y-up source as Z-up in world bounds.
        self.assertEqual(postprocess.vertical_axis((0.728, 0.257, 1.165)), 2)
        self.assertEqual(postprocess.vertical_axis((0.906, 0.304, 1.680)), 2)
        self.assertEqual(postprocess.vertical_axis((1.0, 1.0, 1.0)), 2, "legacy Z wins exact ties")

    def test_grounding_centers_nonvertical_axes_and_puts_feet_on_zero(self):
        y_up = postprocess.grounded_center_offset((-0.3644, 0.0, -0.1325), (0.3636, 1.1647, 0.1247), 1)
        self.assertAlmostEqual(y_up[0], 0.0004, places=6)
        self.assertEqual(y_up[1], 0)
        self.assertAlmostEqual(y_up[2], 0.0039, places=6)

        z_up = postprocess.grounded_center_offset((-0.453, -0.152, 0.0), (0.453, 0.152, 1.68), 2)
        self.assertEqual(z_up, (0.0, 0.0, 0.0))

    def run_finalizer_main(self, contract_ok):
        with tempfile.TemporaryDirectory(prefix="farmacheck-finalizer-contract-") as tmp:
            temp = Path(tmp)
            raw = temp / "fixture.glb"
            output = temp / "final.glb"
            raw.write_bytes(b"test fixture; GLB parsing is intentionally mocked")
            metrics = {
                "tris_final": 30000,
                "altura": 1.72 if contract_ok else 2.04,
                "tamanho_mb": 0.3,
                "contract_ok": contract_ok,
                "falhas": [] if contract_ok else ["altura fora de [1.70,1.74]"],
            }
            stdout = io.StringIO()
            argv = [
                str(ROOT / "scripts/comfy/finalize_assets.py"),
                "--raw", str(raw), "--out", str(output), "--id", "pipeline-contract-test",
            ]
            with patch.object(finalizer, "asset_kinds", return_value={}), \
                 patch.object(finalizer, "glb_info", return_value={"skins": 0, "animations": 0}), \
                 patch.object(finalizer, "blender_normalize", return_value=30000), \
                 patch.object(finalizer, "sh", return_value=None), \
                 patch.object(finalizer, "validate_contract", return_value=metrics), \
                 patch.object(sys, "argv", argv), \
                 contextlib.redirect_stdout(stdout):
                try:
                    finalizer.main()
                except SystemExit as exc:
                    exit_code = exc.code
                else:
                    self.fail("finalizer.main() must terminate with an explicit exit code")
            return exit_code, stdout.getvalue()

    def test_contract_failure_exits_nonzero_and_never_claims_success(self):
        exit_code, output = self.run_finalizer_main(False)
        self.assertEqual(exit_code, 1)
        self.assertIn("❌ ERRO: contrato do GLB reprovado", output)
        self.assertNotIn("✅ CONCLUÍDO", output)

    def test_contract_success_exits_zero(self):
        exit_code, output = self.run_finalizer_main(True)
        self.assertEqual(exit_code, 0)
        self.assertIn("✅ CONCLUÍDO", output)

    def test_contract_rejects_mesh_not_grounded(self):
        with tempfile.NamedTemporaryFile() as output:
            output.write(b"glb")
            output.flush()
            info = {
                "extensionsUsed": ["EXT_meshopt_compression", "EXT_texture_webp"],
                "uv0": True,
                "tris": 30000,
                "height": 1.72,
                "min": [-0.5, 0.01, -0.2],
            }
            with patch.object(finalizer, "glb_info", return_value=info):
                metrics = finalizer.validate_contract(output.name, 30000, 1.72, 8)

        self.assertFalse(metrics["contract_ok"])
        self.assertTrue(any("pés não aterrados" in failure for failure in metrics["falhas"]))

    def test_blender_normalize_rejects_empty_export(self):
        with tempfile.TemporaryDirectory(prefix="farmacheck-blender-export-") as tmp:
            raw = Path(tmp) / "raw.glb"
            output = Path(tmp) / "empty.glb"
            raw.write_bytes(b"raw fixture")
            result = types.SimpleNamespace(
                returncode=0,
                stdout="[post] malhas: 1 | tris: 123\n",
                stderr="OSError [Errno 122] Disk quota exceeded",
            )
            with patch.object(finalizer, "sh", return_value=result):
                with self.assertRaisesRegex(RuntimeError, "GLB não vazio") as exc:
                    finalizer.blender_normalize(str(raw), str(output))
            self.assertIn("Disk quota exceeded", str(exc.exception))

    def test_finalize_uses_configurable_unique_scratch_paths(self):
        with tempfile.TemporaryDirectory(prefix="farmacheck-finalize-scratch-") as tmp:
            root = Path(tmp)
            raw = root / "raw.glb"
            output = root / "candidate.glb"
            scratch = root / "scratch"
            raw.write_bytes(b"raw fixture")
            calls = []

            def record_command(command, **_kwargs):
                calls.append(command)
                return types.SimpleNamespace(returncode=0, stdout="", stderr="")

            metrics = {
                "tris_final": 30000,
                "altura": 1.72,
                "tamanho_mb": 0.3,
                "contract_ok": True,
                "falhas": [],
            }
            with patch.object(finalizer, "TEMP_DIR", str(scratch)), \
                 patch.object(finalizer, "glb_info", return_value={"skins": 0, "animations": 0}), \
                 patch.object(finalizer, "blender_normalize", return_value=500000), \
                 patch.object(finalizer, "sh", side_effect=record_command), \
                 patch.object(finalizer, "validate_contract", return_value=metrics), \
                 contextlib.redirect_stdout(io.StringIO()):
                result = finalizer.finalize_one(str(raw), str(output), 30000)

            self.assertTrue(result["contract_ok"])
            self.assertEqual(len(calls), 3)
            staged = [calls[0][2], calls[0][3], calls[1][2], calls[1][3], calls[2][2]]
            self.assertTrue(all(str(scratch) in path for path in staged))
            self.assertTrue(any("_" + str(os.getpid()) + "_" in path for path in staged))

    def test_finalizer_rejects_animated_input_before_blender_or_output(self):
        with tempfile.TemporaryDirectory(prefix="farmacheck-static-finalizer-") as tmp:
            raw = Path(tmp) / "walk.glb"
            output = Path(tmp) / "must-not-exist.glb"
            raw.write_bytes(b"fixture")
            with patch.object(finalizer, "glb_info", return_value={"skins": 1, "animations": 2}), \
                 patch.object(finalizer, "blender_normalize") as normalize:
                with self.assertRaisesRegex(RuntimeError, "apenas GLB estático"):
                    finalizer.finalize_one(str(raw), str(output), 30000)
            normalize.assert_not_called()
            self.assertFalse(output.exists())

    def test_finalizer_rejects_unknown_input_animation_metadata(self):
        with tempfile.TemporaryDirectory(prefix="farmacheck-static-finalizer-unknown-") as tmp:
            raw = Path(tmp) / "unknown.glb"
            output = Path(tmp) / "must-not-exist.glb"
            raw.write_bytes(b"fixture")
            with patch.object(finalizer, "glb_info", return_value={"tris": 3}):
                with self.assertRaisesRegex(RuntimeError, "não foi possível confirmar"):
                    finalizer.finalize_one(str(raw), str(output), 30000)
            self.assertFalse(output.exists())


if __name__ == "__main__":
    unittest.main(verbosity=2)
