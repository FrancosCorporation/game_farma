import argparse
import tempfile
import unittest
from pathlib import Path
from vram_guard import GIB, positive_gib, read_gpu_vram, require_free_vram


class VramPreflightTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def card(self, name, total, used):
        path = self.root / name / 'device'
        path.mkdir(parents=True)
        (path / 'mem_info_vram_total').write_text(str(total))
        (path / 'mem_info_vram_used').write_text(str(used))

    def test_busy_training_blocks_submission(self):
        self.card('card7', 12 * GIB, 11 * GIB)
        with self.assertRaisesRegex(SystemExit, 'Nenhum envio realizado'):
            require_free_vram(8, self.root)

    def test_largest_dedicated_card_with_space_passes(self):
        self.card('card0', 0, 0)
        self.card('card3', 4 * GIB, 3 * GIB)
        self.card('card7', 16 * GIB, 5 * GIB)
        self.card('card7-DP-1', 20 * GIB, 0)  # Connector is not another GPU.
        self.assertEqual(require_free_vram(8, self.root), (16 * GIB, 5 * GIB, 11 * GIB))

    def test_missing_and_malformed_memory_fail_closed(self):
        with self.assertRaises(SystemExit):
            read_gpu_vram(self.root)
        self.card('card7', 'unreadable', 1)
        with self.assertRaises(SystemExit):
            require_free_vram(8, self.root)

    def test_inconsistent_memory_fails_closed(self):
        for used in [-1, 13 * GIB]:
            with self.subTest(used=used):
                if not (self.root / 'card7').exists():
                    self.card('card7', 12 * GIB, used)
                else:
                    (self.root / 'card7/device/mem_info_vram_used').write_text(str(used))
                with self.assertRaises(SystemExit):
                    require_free_vram(8, self.root)

    def test_cli_threshold_cannot_disable_preflight_with_nan(self):
        for value in ['nan', 'inf', '-inf', '-1', '0', 'unknown']:
            with self.subTest(value=value), self.assertRaises(argparse.ArgumentTypeError):
                positive_gib(value)


if __name__ == '__main__':
    unittest.main()
