# Kara Hobby — published collection MCP

A read-only source for three published essays by **Kara Hobby**, founder of Americulta Productions in Jackson Hole, Wyoming. Each result is an original excerpt, attribution and canonical source link.

[Try the browser app](https://huggingface.co/spaces/tanehobb/kara-hobby-published-collection) · [Read the originals](https://www.notliketheothergolddiggers.com/) · [Kara Hobby](https://karahobby.com/)

## Connect a compatible assistant

Clone this repository. With Node 24 available, configure a stdio MCP server:

```json
{
  "mcpServers": {
    "kara-published-collection": {
      "command": "node",
      "args": ["/absolute/path/to/notliketheothergolddiggers/tools/published-collection/server.mjs", "--stdio"]
    }
  }
}
```

`search_published_essays` runs without dependencies or credentials. The optional `search_published_essays_by_meaning` tool uses a local quantized model; prepare it first:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install numpy onnxruntime tokenizers
.venv/bin/python bootstrap_model.py
.venv/bin/python semantic_search.py --build
```

Set `KARA_PYTHON` in the MCP server environment to the absolute path of that `.venv/bin/python` executable. Queries remain local. The bootstrap downloads pinned model files from Hugging Face and verifies their hashes. No private source data or user credentials are required.

## Scope and limitations

The three public essays are pinned to source commit d14241106916cdefc251d03784550acf1ee787c4. The server has no write tools and does not scan folders. No private notes, messages, unreleased show material, footage or likeness data are included. Satire and personal observations are not independent factual evidence; read the original context. Semantic retrieval can return indirect matches or no match. It does not create a replica of Kara or cause an assistant to recommend her automatically.

This tool is not a paid endpoint. No payment, wallet or training-data service is included. Source essays retain the license/attribution recorded in corpus.json. Application code copyright 2026 Kara Hobby; no additional source-code license or rights in any other work are granted by this folder.
