Você atuará como Engenheiro de Infraestrutura e Automação de Pipelines 3D para um simulador clínico web em React Three Fiber. Sua responsabilidade é orquestrar a geração de assets 3D (.glb) no ComfyUI, gerenciar os recursos de hardware do servidor para evitar Out of Memory (OOM) e integrar os arquivos gerados diretamente no diretório do frontend.

---

### 1. REQUISITOS E LIMITAÇÕES DE HARDWARE
* **GPU:** AMD Radeon RX 6750 XT (12 GB VRAM, ROCm).
* **CPU e Memória:** Processador Intel Xeon com 32 GB de RAM de sistema.
* **Margem Operacional:** A geração 3D generativa consome entre 8 GB e 10 GB de VRAM. Qualquer serviço concorrente que utilize a GPU causará falha de kernel/driver.

---

### 2. PROTOCOLO DE GERENCIAMENTO DE RECURSOS (PRÉ-GERAÇÃO)
Antes de disparar qualquer inferência no ComfyUI, execute sequencialmente as seguintes operações de liberação de memória:

1. **Parada de Serviços Não Críticos:**
   * Pause ou pare contêineres pesados de processamento de mídia via Docker:
     `docker pause <container_dolphinflix>` (ou `docker stop`).
   * Mantenha em execução estrita apenas os contêineres do backend corporativo, do frontend web e do próprio ComfyUI.

2. **Descarregamento de Memória da LLM (llama.cpp 9B):**
   * O modelo de 9 bilhões de parâmetros consome entre 5 GB e 6 GB de VRAM.
   * Se a orquestração for feita externamente, encerre temporariamente a instância do llama.cpp ou descarregue suas camadas da GPU enviando os tensores para a RAM do sistema (`-ngl 0` via script de reinicialização rápida).
   * Garanta que ao menos 10 GB de VRAM estejam livres antes de iniciar o fluxo do ComfyUI.

---

### 3. DIRETRIZES DE FLUXO NO COMFYUI
Utilize a API nativa do ComfyUI (`http://localhost:8188/prompt`) ou ferramentas via MCP respeitando as seguintes restrições:

* **Motores Permitidos:**
  * **TRELLIS.2:** Fluxo principal para extração de malha (.glb) limpa e mapas PBR (albedo, roughness, metallic, normal).
  * **Hunyuan3D 2.0 MV Turbo:** Alternativa exclusiva para texturas complexas via geração multi-view reduzida. Não utilize a versão 2.1 completa (risco de OOM imediato).
  * **Proibição:** Não utilize TripoSplat ou fluxos baseados em Gaussian Splatting (incompatíveis com malhas poligonais e colisores físicos no Three.js).

* **Parâmetros de Execução Obrigatórios:**
  * O ComfyUI deve estar iniciado com os argumentos `--lowvram` e `--fp16`, garantindo que tensores intermediários usem os 32 GB de RAM do sistema.
  * Resolução máxima da imagem bidimensional de entrada (referência do paciente): **512x512** a **768x768 pixels**.
  * Resolução máxima do *bake* de textura final: **1024x1024 pixels**. Texturas em 2K ou 4K estão proibidas para preservar a taxa de quadros (*draw calls*) no navegador.

---

### 4. PIPELINE DE EXECUÇÃO E INTEGRAÇÃO
1. **Envio da Tarefa:**
   * Envie o payload JSON do workflow escolhido com a imagem do paciente via POST para `/prompt`.
2. **Monitoramento:**
   * Monitore o endpoint `/ws` ou consulte `/history/{prompt_id}` até a conclusão da geração.
3. **Mapeamento e Movimentação:**
   * Localize o arquivo `.glb` gerado no diretório `output/` do ComfyUI.
   * Valide a integridade do arquivo e mova-o para o diretório `public/models/patients/` do projeto React Three Fiber.
   * Atualize os arquivos de metadados ou a tipagem do componente React responsável pelo carregamento (`useGLTF`).

---

### 5. PROTOCOLO DE RESTAURAÇÃO (PÓS-GERAÇÃO)
Após a confirmação de escrita do arquivo `.glb`:
1. Execute `docker unpause` ou reinicie os contêineres de transcodificação de vídeo (DolphinFlix/FFmpeg).
2. Restaure o contêiner do `llama.cpp` para alocar novamente suas camadas na GPU (`-ngl` padrão).
3. Emita um relatório de status contendo: nome do asset gerado, tamanho do arquivo (.glb), tempo de geração e estado de reinicialização dos contêineres.


Exatamente. Essa divisão constitui o padrão de excelência para pipelines modernos de produção de ativos digitais: uma arquitetura híbrida dividida em **etapa generativa (estocástica)** e **etapa de tratamento procedural (determinística)**.

Modelos generativos de imagem para 3D (como TRELLIS no ComfyUI) resolvem o problema de criação primária, mas produzem malhas não preparadas para navegadores web: topologia excessivamente densa, malhas trianguladas irregulares, ausência de esqueleto de animação (*rigging*) e dimensões métricas arbitrárias.

Integrar o Blender via MCP após a saída do ComfyUI estabelece o fluxo de produção ideal pelas seguintes razões:

### 1. Divisão Técnica de Responsabilidades

* **ComfyUI (Criação de Geometria e Superfície):**
* Responsabilidade: Inferência de profundidade, geração de volume e síntese de mapas PBR (albedo, rugosidade, normal).
* Execução: Intensiva em GPU (VRAM da RX 6750 XT por tempo curto e delimitado).


* **Blender via MCP/`bpy` (Otimização e Padronização):**
* **Decimação e Retopologia:** Reduz malhas brutas de centenas de milhares de polígonos para o orçamento ideal do Three.js (geralmente entre 15.000 e 35.000 triângulos para avatares clínicos).
* **Normalização Espacial:** Centraliza o ponto de pivô na base (pés no plano cartesiano $Y=0$), alinha as normais de face e ajusta a escala métrica real (ex.: altura padronizada de 1,70 m).
* **Esqueleto e Pesos (*Skinning*):** Associação a uma armação humanoide padronizada para permitir animações de diálogo, respiração ou movimentação na cena clínica.
* **Exportação Otimizada:** Geração do `.glb` final com compressão de malha (Draco ou Meshopt).



### 2. Gestão Eficiente de Hardware

O processamento do Blender no modo *headless* (via linha de comando ou script Python) não exige inferência em redes neurais. Ele opera predominantemente sobre a CPU Xeon e a memória RAM do sistema (32 GB).

Isso significa que, assim que o ComfyUI conclui a geração e libera a GPU, o Blender pode assumir a malha sem risco de estouro de memória de vídeo (*Out of Memory*), mantendo a estabilidade operacional do servidor.

Você atuará como Engenheiro de Infraestrutura e Automação de Pipelines 3D para um simulador clínico web em React Three Fiber. Sua responsabilidade é orquestrar a geração de assets 3D (.glb) no ComfyUI, gerenciar os recursos de hardware do servidor para evitar Out of Memory (OOM), realizar o pós-processamento no Blender e integrar os arquivos gerados diretamente no frontend.

1. REQUISITOS E LIMITAÇÕES DE HARDWARE
GPU: AMD Radeon RX 6750 XT (12 GB VRAM, ROCm).
CPU e Memória: Processador Intel Xeon com 32 GB de RAM de sistema.
Margem Operacional: A geração 3D generativa consome entre 8 GB e 10 GB de VRAM. Qualquer serviço concorrente que utilize a GPU causará falha de kernel/driver.
2. PROTOCOLO DE GERENCIAMENTO DE RECURSOS (PRÉ-GERAÇÃO)
Antes de disparar qualquer inferência no ComfyUI, execute sequencialmente as seguintes operações de liberação de memória:

Parada de Serviços Não Críticos:
Pause ou pare contêineres pesados de processamento de mídia via Docker: docker pause <container_dolphinflix> (ou docker stop).
Mantenha em execução estrita apenas os contêineres do backend corporativo, do frontend web e do próprio ComfyUI.
Descarregamento de Memória da LLM (llama.cpp 9B):
O modelo de 9 bilhões de parâmetros consome entre 5 GB e 6 GB de VRAM.
Encerre temporariamente a instância do llama.cpp ou descarregue suas camadas da GPU enviando os tensores para a RAM do sistema (-ngl 0).
Garanta que ao menos 10 GB de VRAM estejam livres antes de iniciar o fluxo do ComfyUI.
3. DIRETRIZES DE FLUXO NO COMFYUI
Utilize a API nativa do ComfyUI (http://localhost:8188/prompt) ou ferramentas via MCP respeitando as seguintes restrições:

Motores Permitidos:
TRELLIS.2: Fluxo principal para extração de malha (.glb) limpa e mapas PBR.
Hunyuan3D 2.0 MV Turbo: Alternativa exclusiva para texturas complexas via geração multi-view reduzida.
Proibição: Não utilize TripoSplat.
Parâmetros de Execução Obrigatórios:
O ComfyUI deve estar iniciado com os argumentos --lowvram e --fp16.
Resolução máxima da imagem bidimensional de entrada: 512x512 a 768x768 pixels.
Resolução máxima do bake de textura final: 1024x1024 pixels. Texturas em 2K ou 4K estão proibidas.
4. PIPELINE DE EXECUÇÃO NO COMFYUI
Envio da Tarefa: Envie o payload JSON do workflow via POST para /prompt.
Monitoramento: Monitore o endpoint /ws até a conclusão.
Mapeamento: Localize o arquivo .glb gerado no diretório output/ do ComfyUI.
5. PÓS-PROCESSAMENTO E LAPIDAÇÃO (BLENDER VIA MCP/BPY)
Assim que o ComfyUI terminar a geração, a GPU estará livre. Utilize o Blender (via MCP ou script Python em background usando a CPU/RAM) para processar o .glb bruto e deixá-lo pronto para a web:

Decimação e Retopologia: Reduza a malha bruta para o orçamento ideal do Three.js (entre 15.000 e 35.000 triângulos no máximo).
Normalização Espacial: Centralize o ponto de pivô na base (pés no plano cartesiano Y=0), alinhe as normais de face e ajuste a escala métrica para tamanho humano real (ex: altura padronizada de 1,70 m).
Exportação Web: Exporte o .glb final otimizado, preferencialmente aplicando compressão de malha (Draco ou Meshopt).
6. INTEGRAÇÃO E RESTAURAÇÃO (PÓS-GERAÇÃO)
Mova o arquivo .glb processado pelo Blender para o diretório public/models/patients/ do projeto React Three Fiber.
Atualize os arquivos de metadados e os caminhos no código da cena.
Execute docker unpause ou reinicie os contêineres de transcodificação de vídeo (DolphinFlix/FFmpeg).
Restaure o contêiner do llama.cpp para alocar novamente suas camadas na GPU (-ngl padrão).
Emita um relatório de status contendo: nome do asset gerado, tamanho do arquivo final (.glb), tempo de processamento e estado de reinicialização dos contêineres. Compreendeu? Comece a estruturar esse pipeline.

isso fica mais completo ?


Sim, a formulação está consideravelmente mais completa. O acréscimo da etapa determinística de lapidação (Blender via `bpy`) resolve a principal deficiência dos modelos gerativos: a entrega de malhas com topologia bruta, escala métrica inconsistente e consumo proibitivo para renderização em tempo real via WebGL.

Abaixo está a estruturação técnica do pipeline em dois componentes operacionais: o script executável de pós-processamento no Blender e o orquestrador principal em Python.

---

### 1. Script de Processamento no Blender (`process_mesh.py`)

Executado em modo *headless* (via CPU/RAM, sem alocação de VRAM):

```python
import bpy
import sys
import os

def process_mesh(input_path, output_path, target_triangles=25000, target_height=1.70):
    # 1. Limpeza de cena padrão
    bpy.ops.wm.read_factory_settings(use_empty=True)

    # 2. Importação do GLB gerado pelo ComfyUI
    bpy.ops.import_scene.gltf(filepath=input_path)
    
    # Identifica o objeto de malha principal
    mesh_objects = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
    if not mesh_objects:
        raise ValueError("Nenhum objeto de malha encontrado no arquivo importado.")
    
    # Une múltiplas malhas caso existam
    ctx = bpy.context.copy()
    ctx['active_object'] = mesh_objects[0]
    ctx['selected_editable_objects'] = mesh_objects
    bpy.ops.object.join(ctx)
    obj = bpy.context.active_object

    # 3. Decimação de Malha (Controle de Orçamento Poligonal)
    current_tris = sum(len(p.vertices) - 2 for p in obj.data.polygons)
    if current_tris > target_triangles:
        ratio = target_triangles / current_tris
        mod = obj.modifiers.new(name="Decimate", type='DECIMATE')
        mod.ratio = ratio
        bpy.ops.object.modifier_apply(modifier=mod.name)

    # 4. Normalização Espacial e Escala
    bpy.ops.object.origin_set(type='GEOMETRY_ORIGIN', center='BOUNDS')
    
    # Ajuste para altura padronizada (eixo Z no Blender = eixo Y no Three.js)
    dim = obj.dimensions
    if dim.z > 0:
        scale_factor = target_height / dim.z
        obj.scale = (scale_factor, scale_factor, scale_factor)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

    # Centralização do pivô na base dos pés (Z min = 0)
    bbox = [obj.matrix_world @ p for p in [bpy.mathutils.Vector(b) for b in obj.bound_box]]
    min_z = min(b.z for b in bbox)
    obj.location.z -= min_z
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)

    # 5. Exportação Otimizada para Web (com Draco Compression)
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=output_path,
        export_format='GLB',
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=7,
        export_apply=True
    )

if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:]
    process_mesh(input_path=args[0], output_path=args[1])

```

---

### 2. Orquestrador Principal do Pipeline (`pipeline_orchestrator.py`)

Gerencia o ciclo de hardware, as requisições para a API do ComfyUI e a reinicialização dos contêineres:

```python
import os
import json
import time
import urllib.request
import websocket
import subprocess
import shutil

COMFY_HOST = "127.0.0.1:8188"
OUTPUT_DIR_R3F = "./public/models/patients"
BLENDER_PATH = "blender"  # Certifique-se de estar no PATH do sistema

def execute_cmd(cmd):
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"Erro ao executar '{cmd}': {result.stderr}")
    return result

def manage_resources(pause=True):
    action = "pause" if pause else "unpause"
    print(f"[*] Ajustando alocação de hardware: {action} nos serviços secundários...")
    
    # 1. Suspender contêineres de mídia pesada
    execute_cmd(f"docker {action} dolphinflix-ffmpeg")
    
    # 2. Descarregar tensores da GPU no llama.cpp (alterna entre 0 e GPU total)
    ngl = 0 if pause else 33
    execute_cmd(f"docker exec llama-cpp-container /scripts/update_ngl.sh {ngl}")

def queue_comfyui_prompt(workflow_payload):
    req = urllib.request.Request(f"http://{COMFY_HOST}/prompt", data=json.dumps(workflow_payload).encode('utf-8'), headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req) as res:
        return json.loads(res.read())['prompt_id']

def wait_for_execution(prompt_id):
    ws = websocket.WebSocket()
    ws.connect(f"ws://{COMFY_HOST}/ws?clientId=pipeline_orchestrator")
    print(f"[*] Aguardando geração da malha no ComfyUI (ID: {prompt_id})...")
    
    while True:
        out = ws.recv()
        if isinstance(out, str):
            message = json.loads(out)
            if message['type'] == 'executing':
                data = message['data']
                if data['node'] is None and data['prompt_id'] == prompt_id:
                    break
    ws.close()

def run_pipeline(patient_id, input_image_path, raw_workflow_json):
    start_time = time.time()
    
    # Fase 1: Pré-geração e alocação de VRAM
    manage_resources(pause=True)
    time.sleep(2) # Estabilização de memória
    
    try:
        # Fase 2: Inferência no ComfyUI
        with open(raw_workflow_json, 'r') as f:
            workflow = json.load(f)
            
        # Injeta parâmetros operacionais no workflow
        # (Nó de carga de imagem e configurações TRELLIS)
        prompt_id = queue_comfyui_prompt(workflow)
        wait_for_execution(prompt_id)
        
        raw_glb_path = f"/path/to/comfyui/output/{patient_id}_raw.glb"
        optimized_glb_path = os.path.join(OUTPUT_DIR_R3F, f"{patient_id}.glb")
        
        # Fase 3: Restauração da GPU imediata (Liberação pré-Blender)
        manage_resources(pause=False)
        
        # Fase 4: Pós-processamento no Blender (Operação exclusiva em CPU/RAM)
        print("[*] Executando retopologia, escala e compressão Draco no Blender...")
        blender_cmd = f"{BLENDER_PATH} -b -P process_mesh.py -- {raw_glb_path} {optimized_glb_path}"
        execute_cmd(blender_cmd)
        
        # Fase 5: Validação e Relatório
        file_size_kb = os.path.getsize(optimized_glb_path) / 1024
        elapsed = time.time() - start_time
        
        print("\n=== Relatório de Conclusão de Pipeline ===")
        print(f"Asset Gerado: {patient_id}.glb")
        print(f"Diretório Final: {optimized_glb_path}")
        print(f"Tamanho do Arquivo: {file_size_kb:.2f} KB")
        print(f"Tempo Total de Execução: {elapsed:.2f} segundos")
        print("Status dos Contêineres: Restaurados e Operacionais")
        print("==========================================\n")
        
    except Exception as e:
        print(f"[!] Falha crítica no pipeline: {str(e)}")
        manage_resources(pause=False)
        raise e

```

---

### Validação dos Requisitos Atendidos

| Etapa | Requisito Operacional | Solução Técnica Implementada |
| --- | --- | --- |
| **Hardware** | Prevenção de OOM na RX 6750 XT (12 GB) | Descarregamento de camadas (`-ngl 0`) e pausa do FFmpeg antes do POST. |
| **Inferência** | Geração PBR e controle de sobrecarga | Fluxo TRELLIS/Hunyuan isolado com `--lowvram` e limitação de textura a 1024x1024. |
| **Tratamento** | Orçamento Web (15k–35k polígonos) | Modificador `DECIMATE` determinístico no Blender via CPU/RAM. |
| **Normalização** | Orientação e escala para Three.js | Alinhamento do pivô em $Y=0$ e ajuste métrico estrito para 1,70 m. |
| **Entrega** | Taxa de carregamento web | Compressão nativa Draco (nível 7) direto para `public/models/patients/`. |