"""Uma personagem por execução: Qwen local, A-pose, candidatos isolados.

Uso: python3 scripts/comfy/generate_patient_reference.py marina_amoxicilina
     --seed 291021 --variants 2 --submit
Sem --submit grava somente o workflow. Não dispara a fila completa do elenco.
"""
import argparse
import json
from pathlib import Path
from urllib.request import Request, urlopen
from vram_guard import positive_gib, require_free_vram

parser = argparse.ArgumentParser()
parser.add_argument('case_id')
parser.add_argument('--seed', type=int, default=291021)
parser.add_argument('--variants', type=int, choices=range(1, 5), default=2)
parser.add_argument('--submit', action='store_true')
parser.add_argument('--output-dir', type=Path, default=None,
                    help='diretório exclusivo para o workflow/job (padrão: ana_work/cast_c1_20261012)')
parser.add_argument('--filename-prefix', default=None,
                    help='prefixo exclusivo para SaveImage (padrão: farmacheck_<caseId>_v001)')
parser.add_argument('--min-free-vram-gib', type=positive_gib, default=8.0,
                    help='VRAM livre mínima antes do envio (checagem pontual, não reserva de memória).')
args = parser.parse_args()
root = Path(__file__).resolve().parents[2]
patients = json.loads((root / 'docs/elenco_planejado.json').read_text())['patients']
patient = next((p for p in patients if p['caseId'] == args.case_id), None)
if not patient:
    parser.error('case_id ausente do elenco planejado')
if patient['status'] == 'aprovado_publicado':
    parser.error('personagem já aprovada: não regenerar por este helper')

# Identidades definidas pelo orquestrador sob escolha visual delegada do usuário.
identities = {
    'marina_amoxicilina': 'One friendly fictional Brazilian adult woman, Marina, 29 years old, medium warm tan skin, neat black shoulder-length hair tucked behind ears, teal-blue short-sleeve simple casual blouse, dark navy straight trousers, clean white sneakers. Distinct individual face from Ana, soft oval face, symmetric friendly brown eyes and calm smile.',
    'jose_gripe': 'One friendly fictional Brazilian adult man, Jose, 44 years old, warm medium brown skin, tidy short black hair, clean-shaven face, forest-green short-sleeve polo shirt, charcoal straight trousers, simple brown casual shoes. Mature rounded face, medium build, gentle brown symmetric eyes and calm friendly smile. Distinct from the young women of the cast.',
    'nelson_infarto': 'One fictional Brazilian adult man, Nelson, 58 years old, warm medium tan skin, short salt-and-pepper hair, broad mature face, beige short-sleeve shirt, dark navy trousers, brown shoes, average solid build.',
    'clara_cefaleia': 'One fictional Brazilian adult woman, Clara, 33 years old, light warm tan skin, chestnut bob haircut, blue simple blouse, navy straight trousers, white sneakers, soft angular mature face, average build.',
    'paulo_dor_lombar': 'One fictional Brazilian adult man, Paulo, 47 years old, medium brown skin, short black hair and neat small beard, rust-brown simple shirt, charcoal trousers, dark brown shoes, medium broad build.',
    'joao_queimacao': 'One fictional Brazilian adult man, Joao, 39 years old, light brown skin, short light brown hair, pale-blue short-sleeve shirt, dark slate trousers, grey casual shoes, slim-to-average build.',
    'helena_avc': 'One fictional Brazilian older adult woman, Helena, 68 years old, warm tan skin, silver-grey hair tied in a small low bun, soft lined face and gentle brown eyes, sage-green blouse, grey straight trousers, comfortable dark flat shoes.',
    'dona_rosa_hipotensao': 'One fictional Brazilian older adult woman, Rosa, 72 years old, medium warm brown skin, short soft white-grey curly hair, purple modest blouse, dark plum trousers, comfortable brown flat shoes, rounded face and average fuller build.',
    'carlos_asma': 'One fictional Brazilian adult man, Carlos, 30 years old, warm brown skin, short curly black hair, grey-teal simple short-sleeve shirt, charcoal straight trousers, grey sneakers, average athletic build without exaggerated muscles.',
    'bia_apendicite': 'One fictional Brazilian adult woman, Bia, 22 years old, warm light tan skin, long chestnut hair in a simple ponytail, ochre casual shirt, dark blue straight jeans, white sneakers, slim natural adult proportions.',
    'carla_dengue': 'One fictional Brazilian adult woman, Carla, 24 years old, medium brown skin, long dark straight hair tucked behind ears, green short-sleeve blouse, navy straight trousers, white sneakers, average natural adult proportions.',
    'roberto_dispepsia': 'One fictional Brazilian adult man, Roberto, 30 years old, light-to-medium warm tan skin, tidy short black hair, clean-shaven face, muted blue polo shirt, charcoal trousers, brown casual shoes, average build.',
    'catia_dermatite': 'One fictional Brazilian adult woman, Catia, 45 years old, medium warm tan skin, brown shoulder-length bob hairstyle, ochre modest blouse, dark brown trousers, dark comfortable shoes, softly rounded mature face and average build.',
}
if args.case_id not in identities:
    parser.error('defina a identidade visual deste paciente antes de gerar')
positive = 'stylized 3D render, Pixar style, casual mobile game art, smooth PBR, clean textures, soft global illumination. ' + identities[args.case_id] + ' Rigging reference, full body FRONT VIEW head to toe entirely visible, centered, comfortable neutral A-pose with both arms extended diagonally down at 40 degrees below horizontal, elbows almost straight, both hands empty and visible with five relaxed separate fingers. Arms clearly separated from torso and hips, armpits open. Symmetric level eyes; natural irises and pupils centered within both visible sclera; calm neutral gaze looking straight toward the camera, not above or below it. Legs slightly apart, knees straight, both feet visible and flat. Natural adult proportions, modest clothing. Plain pure WHITE background, no floor line, no shadow on ground, no labels, no text, no frame. Full-body single-view character reference for a 3D game asset.'
negative = 'cropped body, missing feet, missing legs, hands on hips, hands in pockets, hands behind body, bent elbows, raised shoulders, asymmetrical eyes, crossed eyes, eyes looking upward, upward gaze, pupils displaced toward upper eyelid, excessive sclera visible below irises, side-looking eyes, extra fingers, fused fingers, deformed hands, multiple people, collage, text, watermark, logo, photorealistic, skin pores, grunge, background scenery, floor texture, heavy ground shadow'
workflow = {
    '1': {'class_type': 'UnetLoaderGGUF', 'inputs': {'unet_name': 'qwen_image_2.1-Q5_K_M.gguf'}},
    '2': {'class_type': 'LoraLoaderModelOnly', 'inputs': {'lora_name': 'Qwen-Image-2512-Lightning-4steps-V1.0-bf16.safetensors', 'strength_model': 1.0, 'model': ['1', 0]}},
    '3': {'class_type': 'CLIPLoader', 'inputs': {'clip_name': 'qwen3vl_8b_int8_convrot.safetensors', 'type': 'qwen_image', 'device': 'default'}},
    '4': {'class_type': 'VAELoader', 'inputs': {'vae_name': 'qwen_image_2.1_vae_bf16.safetensors'}},
    '5': {'class_type': 'ModelSamplingAuraFlow', 'inputs': {'shift': 3.1, 'model': ['2', 0]}},
    '6': {'class_type': 'CLIPTextEncode', 'inputs': {'text': positive, 'clip': ['3', 0]}},
    '7': {'class_type': 'CLIPTextEncode', 'inputs': {'text': negative, 'clip': ['3', 0]}},
    '8': {'class_type': 'EmptySD3LatentImage', 'inputs': {'width': 832, 'height': 1248, 'batch_size': args.variants}},
    '9': {'class_type': 'KSampler', 'inputs': {'seed': args.seed, 'steps': 4, 'cfg': 1.0, 'sampler_name': 'euler', 'scheduler': 'simple', 'denoise': 1.0, 'model': ['5', 0], 'positive': ['6', 0], 'negative': ['7', 0], 'latent_image': ['8', 0]}},
    '10': {'class_type': 'VAEDecode', 'inputs': {'samples': ['9', 0], 'vae': ['4', 0]}},
    '11': {'class_type': 'SaveImage', 'inputs': {'filename_prefix': args.filename_prefix or f'farmacheck_{args.case_id}_v001', 'images': ['10', 0]}},
}
output = args.output_dir or (root / 'ana_work' / 'cast_c1_20261012')
if not output.is_absolute():
    output = root / output
output.mkdir(parents=True, exist_ok=True)
(output / f'{args.case_id}.workflow.json').write_text(json.dumps(workflow, ensure_ascii=False, indent=2))
if args.submit:
    require_free_vram(args.min_free_vram_gib)
    with urlopen('http://127.0.0.1:8188/queue', timeout=10) as response:
        queue = json.load(response)
    if queue.get('queue_running') or queue.get('queue_pending'):
        raise SystemExit('GPU ocupada: conclua a geração atual antes de enviar outra.')
    request = Request('http://127.0.0.1:8188/prompt', data=json.dumps({'prompt': workflow, 'client_id': f'farmacheck_{args.case_id}'}).encode(), headers={'Content-Type': 'application/json'})
    with urlopen(request, timeout=30) as response:
        result = json.load(response)
    (output / f'{args.case_id}.job.json').write_text(json.dumps(result, indent=2))
    print(json.dumps(result))
else:
    print('Workflow preparado; nenhuma geração iniciada:', output / f'{args.case_id}.workflow.json')
