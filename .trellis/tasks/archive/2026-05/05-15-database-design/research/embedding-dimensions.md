# Embedding Dimension Notes

## Sources

* Alibaba Cloud Model Studio official docs: `https://www.alibabacloud.com/help/en/model-studio/embedding-and-rerank/`
* Qwen Cloud official docs: `https://docs.qwencloud.com/developer-guides/getting-started/embedding-models`

## Findings

* For text-only search, RAG, and clustering, the official docs recommend `text-embedding-v4`.
* `text-embedding-v4` supports multiple dimensions, including 1024 as the default.
* Official guidance describes 1024 dimensions as the general-purpose balance; lower dimensions favor storage, while 1536/2048 favor retrieval accuracy.

## Design Implication

For Production v1, use a fixed `vector(1024)` column for `chunk_embeddings.embedding` and record provider/model metadata with each embedding row:

* `provider_id`
* `model_id`
* `dimensions`

Changing the embedding model or vector dimension later should be handled by an explicit schema migration plus re-embedding workflow, not by trying to mix incompatible vector dimensions in the same pgvector column.
