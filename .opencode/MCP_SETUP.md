# Configuração de MCPs para Game Farma

## 1. Blender MCP (✅ Configurado no opencode)

**Repo:** https://github.com/ahujasid/blender-mcp (27.1k ⭐)

### Instalação

```bash
# 1. Instalar uv (se não tiver)
curl -LsSf https://astral.sh/uv/install.sh | sh

# 2. Instalar o addon no Blender
uvx blender-mcp install-addon
```

### No Blender
1. **Edit → Preferences → Add-ons** → procure "MCP for Blender" → habilite
2. No 3D Viewport, pressione `N` → aba **MCP for Blender** → clique **Start MCP Server**

### Uso no opencode
Já configurado em `.opencode/opencode.json`. O opencode conecta automaticamente via `uvx blender-mcp`.

---

## 2. Unity MCP (⚠️ Instalação via Unity Package Manager)

**Repo:** https://github.com/CoplayDev/unity-mcp (13.9k ⭐)

### Instalação no Unity

**Opção A - Via Git URL (recomendado):**
1. Unity → **Window → Package Manager**
2. **+** → **Add package from git URL**
3. Cole: `https://github.com/CoplayDev/unity-mcp.git?path=/MCPForUnity#main`
4. Para fixar versão: `#v10.0.0` em vez de `#main`

**Opção B - Via OpenUPM:**
```bash
# No terminal do projeto Unity
openupm add com.coplaydev.unity-mcp
```

### Configuração no Unity
1. **Window → MCP for Unity → Configure All Detected Clients**
2. Isso configura automaticamente o MCP para Claude Desktop, Cursor, VS Code, etc.

### Para usar com opencode
O unity-mcp roda como um servidor TCP dentro do Unity Editor. Para conectar via opencode, você precisa:

1. Iniciar o Unity Editor com o projeto
2. O servidor MCP roda na porta padrão (verificar nas configurações)
3. Adicionar configuração TCP no opencode (não stdio como o blender-mcp)

Exemplo de configuração TCP (ajustar porta conforme necessário):
```json
{
  "mcp": {
    "unity-mcp": {
      "type": "remote",
      "url": "http://localhost:8080/mcp",
      "enabled": true
    }
  }
}
```

---

## 3. Próximos Passos - Banco de Skills (Sitecore/Gate)

Para integrar com o banco de skills interno (Sitecore/Gate):

1. **Verificar se já existem skills cadastradas** para Blender/Unity MCP
2. **Cadastrar novas skills** se não existirem:
   - `blender-mcp`: Modelagem 3D, geração de assets, materiais, cenas
   - `unity-mcp`: Criação de cenas, GameObjects, scripts C#, assets, builds

3. **Fit/Gap Analysis:**
   - Mapear capabilities de cada MCP
   - Identificar overlap com skills existentes
   - Documentar novos casos de uso para jogos

---

## Comandos Úteis

```bash
# Atualizar blender-mcp
uvx --refresh blender-mcp

# Ver caminhos do addon
uvx blender-mcp addon-paths

# Testar conexão blender-mcp
uvx blender-mcp  # roda o servidor MCP (para testar)

# No Unity, verificar logs do MCP
# Window → MCP for Unity → Show Logs
```

---

## Recursos

- **Blender MCP:** https://mcp-for-blender.com/ | Discord: https://discord.gg/SNqPn4TcKQ
- **Unity MCP:** https://coplaydev.github.io/unity-mcp/ | Discord: https://discord.gg/y4p8KfzrN4
- **Model Context Protocol:** https://modelcontextprotocol.io/