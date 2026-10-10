---
name: hitem3d-meshwright
description: "Quando usar: gerar/inspecionar malhas 3D na nuvem para o pipeline de personagens; NÃO usar para rig/animação"
license: internal
---

# Hitem3D / Meshwright — geração e inspeção de malhas 3D para o pipeline game_farma

## Contexto

O vídeo compara três abordagens para criar malhas 3D a partir de imagens ou prompts:

(a) ChatGPT/Claude escrevendo scripts Python para modelar/riggar hard-surface DENTRO do Blender;
(b) Hitem3D (hi3d.ai), Meshy, CSM e Tripo gerando malhas 3D detalhadas a partir de UMA imagem;
(c) Validação das malhas no Meshwright (furos, partes soltas, topologia, normais); e um experimento local com ComfyUI+Ollama+Blender toolbox.

## Hitem3D / hi3d.ai

- **O que é**: Serviço de geração de malhas 3D na nuvem a partir de uma imagem, usando modelos de difusão.
- **Fluxo**: upload de 1 imagem → gerar malha → download. Código promocional citado na descrição do vídeo: `GEEKATPLAY5`.
- **Nome**: a auto-legenda transcreve como "Hire3D"; o nome correto (site/descrição) é **Hitem3D / hi3d.ai**.
- **Para que brilha**: malha orgânica/texturizada, boa para impressão 3D e visualização rápida.
- **Limitações que o vídeo mostra**: malha para impressão 3D ≠ malha fácil de riggar; buracos/partes desconectadas podem aparecer em casos; a malha resultante pode ter topologia inadequada para rigging (como visto no experimento com 34 furos e arestas não-manifold no modelo testado).

## Meshwright

- **Repositório**: https://github.com/GeekatplayStudio/Meshwright
- **Função**: inspector de malha que detecta buracos, partes desconectadas, topologia e normais.
- **Como se encaixa no QA**: deve ser usado ANTES de subir no Mixamo para validar se a malha está "limpa" o suficiente para rigging. O vídeo mostra que o modelo testado tinha 34 aberturas (holes) e non-manifold edges, o que classifica como "caminho errado" para rigging.
- **Checklist mínimo antes do Mixamo**: abrir a malha no Meshwright e exigir holes ≈ 0–1, non-manifold edges = 0 e partes desconectadas apenas as intencionais (cabelo/acessório separado é aceitável se acompanhar o rig).

## Blender toolbox / ComfyUI local

- **Referência**: https://github.com/GeekatplayStudio/ComfyUI_Blender_toolbox
- **Experimento local do vídeo**: tenta gerar Python scripts dentro do Blender usando LLM locais (Ollama) para criar malhas a partir de primitivas. O vídeo observa que essa abordagem tem gargalo na montagem/peças pequenas e não chega perto da qualidade das abordagens em nuvem (hi3d.ai, Meshy, CSM).

## Lição para o nosso pipeline (game_farma)

- **Malha boa p/ visual ≠ malha boa p/ rig**: a validação no Meshwright (ou equivalente) é etapa obrigatória ANTES de subir no Mixamo.
- **Centralizar pivô antes do upload**: conforme já documentado no SKILL_H (centralizar pivô no centro do BBOX da malha, usando `origin_set(ORIGIN_GEOMETRY, center='BOUNDS')` + `transform_apply(location=True)`).
- **Comparar abordagens**: nuvem (hi3d.ai) vs local (Hunyuan/ComfyUI) vs script no Blender — cada uma tem casos de uso diferentes.

## Como transcrever vídeos do YouTube (custo zero)

O comando usado:

```
/home/servidor/.local/bin/yt-dlp --skip-download --write-auto-subs --sub-langs "en" --sub-format srt -o "/media/servidor/nvme_data/scratch/tmp/opencode/video_jMw9VANg9-c.%(ext)s" "https://www.youtube.com/watch?v=jMw9VANg9-c"
```

Limpeza do VTT/SRT (método desta skill):

1. Remover cabeçalhos ("WEBVTT"), timestamps (`00:00:00,234 --> 00:00:02,074`) e numeração de bloco.
2. Remover tags tipo `<c>`, `<00:00:00.000>`, alinhamentos.
3. Deduplicar linhas consecutivas idênticas (o VTT de auto-legenda repete linhas por sobreposição).
4. Juntar tudo em parágrafos por bloco de fala (mantendo quebras razoáveis).

O script Python grava o resultado em:
`/media/servidor/nvme_data/scratch/tmp/opencode/video_jMw9VANg9-c_transcript.txt`
com aproximadamente 3006 palavras.
