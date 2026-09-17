# 🎨 FarmaCheck — Diretrizes de Arte Estilizada (3D casual mobile)

> **Data:** 14/09/2026 · **Status:** ATIVA — substitui toda diretriz fotorrealista
> **Decisão do PO:** abandonar o alvo "GTA V / fotorrealismo". O jogo é **3D estilizado
> casual mobile** (leitura Pixar/Disney), leve para a web e consistente entre assets.
> Realismo antigo arquivado em `future_projects/realism_core/` (não referenciar).

---

## 1. Os seis âncoras (usar literalmente em prompts)

Todo asset 3D — personagem, prop, ambiente — nasce com estes âncoras:

```
stylized 3D render, Pixar style, casual mobile game art,
smooth PBR, clean textures, soft global illumination
```

| Âncora | O que significa na prática | O que NÃO é |
|---|---|---|
| `stylized 3D render` | Formas limpas, proporções levemente exageradas, silhueta legível | escaneado, fotogrametria, ruído de superfície |
| `Pixar style` | Apelo de personagem, olhos expressivos, materiais macios | cartoon chapado 2D, anime, chibi extremo |
| `casual mobile game art` | Leve, colorido, claro, amigável, roda em celular | AAA realista, textura densa, normal map de poros |
| `smooth PBR` | PBR com roughness médio-alto, sem micro-detalhe | specular duro, metal escovado realista, SSS pesado |
| `clean textures` | Poucas cores, formas grandes, sem sujeira/grunge | decals realistas, desgaste fotográfico, AO bake pesado |
| `soft global illumination` | Luz difusa, sombras suaves, ambiente claro | sombra dura preta, contraste cinematográfico dramático |

### Lista negativa (nunca pedir)

`photorealistic, hyperrealistic, GTA V, 8k detail, skin pores, photogrammetry, scan,
grunge, dirt, scratches, realistic human face, PBR micro-detail, cinematic dark lighting`

---

## 2. Orçamentos (web-first, 60 fps)

| Categoria | Tris (ideal → máx) | Texturas | Materiais | Observação |
|---|---|---|---|---|
| Personagem | 6k → 15k | 1–2 × 1024² | ≤ 3 | sem morphs pesados; rig simples |
| Prop pequeno | 300 → 2k | 1 × 512² | 1 | caixa, monitor, caixa de remédio |
| Móvel/prop grande | 1k → 8k | 1 × 1024² | 1–2 | balcão, gôndola, vitrine, mesa |
| Ambiente (kit) | 2k → 20k | atlas 1024² | atlas único | módulos reutilizáveis |
| Arquitetura externa | ≤ 5k por prédio | 1 × 512² | 1 | fundo, sem interiores |

Regras fixas:
- **Compressão:** meshopt (já suportado em `src/scene/glbLoader.js`); Draco só quando o consumidor aceitar.
- **Escala real em metros, Y-up, pivô no chão (Y=0).**
- **Uma paleta por cena** — no máximo ~8 cores saturadas + neutros claros.
- **Zero dependência de textura única gigante**: atlas, tiling ou vertex color.

---

## 3. Materiais e iluminação

### Materiais (MeshlineStandard/Physical do three r169)
- `roughness`: **0.45–0.8** (superfícies macias). Evitar `0` (vidro espelhado realista).
- `metalness`: **0 ou 0.1–0.3** (metais estilizados são claros e suaves, não espelhados).
- Emissivo: usar para telas, letreiros, luzes — com `emissiveIntensity` baixo (0.6–1.4).
- Pele estilizada: cor sólida/map simples, `roughness ~0.55`, **sem sheen/SSS** (o sheen fake-SSS do `patient.js` é herança realista — ao substituir o asset, simplificar).
- Olhos: esferas com highlight pintado ou emissivo pequeno — não clearcoat realista.

### Iluminação (cena)
- Ambiente: **hemisférica clara** + `global ambient` médio (evita preto chapado).
- Key light: direcional suave, sombra **filtrada/suave**, intensidade contida.
- Preencher com 1–2 point lights de pouca intensidade; sem rim light cinematográfico.
- Fog: leve se ajudar profundidade; tom claro, nunca escuro dramático.
- Sombras: contato (blob/elipse) para personagens — mais barato e mais "casual" que shadow map duro.

---

## 4. Prompts por ferramenta

### Hunyuan3D / Hyper3D (geração por texto)
Usar os seis âncoras **sempre juntos**, descrevendo sujeito + função + paleta. Exemplos:

- **Paciente estilizado adulto:**
  `stylized 3D render, Pixar style, casual mobile game art, friendly adult pharmacy patient, standing neutral pose, simple casual clothes, soft pastel palette, smooth PBR, clean textures, soft global illumination, full body, game asset`
- **Farmacêutico(a) balcão:**
  `stylized 3D render, Pixar style, casual mobile game art, friendly pharmacist in white coat, warm smile, standing behind counter, soft pastel palette, smooth PBR, clean textures, soft global illumination, full body, game asset`
- **Prop (gôndola de medicamentos):**
  `stylized 3D render, casual mobile game art, clean pharmacy shelf with few colorful medicine boxes, chunky readable shapes, smooth PBR, clean textures, soft global illumination, game prop`

**Atenção:** gerador pode devolver topologia suja/alta. Passar pelo Blender MCP para:
decimar ao budget, relaxar normais, renomear materiais, aplicar escala/pivô.

### Imagem de referência (image-to-3D)
Preferir concept **já estilizado** (não foto). Se a referência for realista, o resultado sai
realista — usar como guia de pose/silhueta e aceitar perda de "cara" real.

### Props/ambiente prontos
Fontes preferidas: **Poly Pizza (CC0/CC-BY low-poly)**, **Polyhaven (HDRI/modelos simples)**,
**Sketchfab (filtrado por downloadable + estilo low-poly)**. Critério de aceite: silhueta
legível + paleta compatível; senão, arquivar.

### Blender MCP (consolidação — obrigatória)
1. Importar o GLB gerado.
2. Decimar para o budget da tabela (Decimate ou retopo).
3. Recalcular normais, aplicar shade smooth com auto-smooth ~30–60°.
4. Materiais: renomear, `roughness ≥ 0.45`, `metalness ≤ 0.3`, cores da paleta.
5. Escala em metros, pivô Y=0, eixo Y-up.
6. Exportar GLB **sem Draco** (o validador do `threlte-mcp` rejeita Draco).
7. Salvar em `public/models/<nome>.glb`.

---

## 5. Checklist de aceite (juiz rápido)

Antes de integrar qualquer asset:

- [ ] Bate os 6 âncoras? (silhueta limpa, cores poucas, sem ruído fotorrealista)
- [ ] Dentro do budget de tris/textura da categoria?
- [ ] Escala em metros e pivô no chão?
- [ ] Materiais com roughness/metalness na faixa estilizada?
- [ ] Lê bem a 2–3 m de câmera (é a distância de jogo)?
- [ ] Combina com os assets vizinhos (paleta e nível de detalhe)?
- [ ] Carrega no loader do jogo (meshopt) sem erro?

Se falhar em "combina com os vizinhos", **não integrar** — consistência > detalhe.

---

## 6. Legado em uso (dívida visual assumida)

Alguns assets atuais são realistas e continuam no jogo até haver substituto estilizado:

| Asset em uso | Uso | Ação |
|---|---|---|
| `public/models/paciente_real.glb` | paciente (GLB rigado) | substituir por base estilizada quando existir |
| `public/models/<caso>.glb` (16) | variações por caso | definir identidade estilizada por caso depois |
| `public/models/atendente_balcon.glb`, `atendente_gondola.glb` | NPCs de fundo | substituir na mesma leva do paciente |
| `public/models/prop_*.glb` | cenário | substituir por props estilizados (Poly Pizza) |

**Não misturar:** substituir por leva, não item a item, para não ter realista e estilizado
lado a lado (quebra a leitura). Enquanto a leva não estiver pronta, o legado fica.

Nada em `future_projects/realism_core/` pode ser referenciado pelo build do jogo.
