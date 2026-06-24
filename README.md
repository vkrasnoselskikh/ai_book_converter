# Ai Book converter

Converter from Any format to epub.
Requirements: Mistral Api KEY, uv


## Usage

```
export MISTRAL_API_KEY=<your_key>
uv run ai-book-converter '/path/to/book.pdf'
```

or Docker

```shell
docker build --no-cache -t ai-book-converter .
docker run --rm -p 8000:8000 -e MISTRAL_API_KEY=<your_key> ai-book-converter
```

