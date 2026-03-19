# Design: AI Book Converter CLI

## Overview

Система реализуется как CLI-пайплайн, который принимает исходный документ книги, создает отдельный "OCR job",
запрашивает у "MistralOCR" постраничный структурированный результат и собирает итоговую reflowable-книгу для Kindle.

Текущая реализация уже содержит базовый пайплайн в модуле `"pdf_ocr.py"`: загрузка PDF, вызов OCR, сохранение JSON,
извлечение изображений и сборка HTML. Целевая архитектура расширяет это поведение до полноценной CLI-утилиты с
поддержкой DJVU, сборкой MOBI, обработкой footer-сносок как endnotes и тестовой стратегией без повторных live API calls.

## Architecture

### CLI Layer

CLI-команда должна:

- валидировать входной путь и формат документа;
- принимать путь к job directory и выходному файлу;
- позволять переиспользовать ранее созданный job directory;
- запускать весь пайплайн либо отдельные этапы для диагностики и отладки.

Рекомендуемый состав CLI-аргументов:

- обязательный аргумент пути к исходной книге;
- `--job-dir` для переиспользования или явного размещения артефактов;
- `--output` для итогового файла;
- `--model` для OCR-модели;
- `--keep-temp` или эквивалентный флаг для сохранения временной директории по завершении.

### Pipeline Stages

Пайплайн должен быть разбит на явные этапы:

1. `validate_input`
2. `prepare_job_dir`
3. `upload_source`
4. `request_ocr`
5. `normalize_ocr_response`
6. `extract_images`
7. `extract_body_and_footnotes`
8. `build_book_markup`
9. `package_mobi`
10. `write_outputs`

Каждый этап должен быть идемпотентен относительно сохраненного состояния job directory.

### Job Directory Layout

Временная директория должна хранить все артефакты, нужные для повторного запуска и диагностики.

Предлагаемая структура:

```text
job_dir/
  state.json
  source/
    original.pdf | original.djvu
  ocr/
    ocr_response.json
    normalized_pages.json
  images/
    <image files>
  book/
    body.md
    endnotes.md
    content.html
    content.opf
    toc.ncx
  output/
    <book>.mobi
  logs/
    pipeline.log
```

Текущие файлы `"state.json"`, `"ocr_response.json"`, `"images/"` и `"content.html"` из `"pdf_ocr.py"` должны быть
сохранены как основа, но разнесены по более явной структуре каталогов.

## OCR Response Model

Нормализованный OCR-ответ должен описывать страницу как структуру:

- `page_index`
- `body_markdown`
- `headers: list[str]`
- `footers: list[str]`
- `images: list[PageImage]`
- `warnings: list[str]`

`PageImage` должна содержать:

- `image_id`
- `source_path`
- `width`
- `height`
- `page_index`
- `anchor_id`

Нормализация нужна потому, что фактический ответ OCR может содержать сырой markdown страницы вместе с отдельными
метаданными header/footer/images, а логика сборки книги должна работать на стабильной внутренней модели.

## Input Format Support

### PDF

PDF должен передаваться в OCR API напрямую, как уже делает текущий код.

### DJVU

Для DJVU требуется один из двух совместимых подходов:

1. Поддержка прямой загрузки DJVU в OCR API, если это разрешено внешним сервисом.
2. Предварительная конвертация DJVU в PDF как отдельный этап пайплайна перед `upload_source`.

Так как текущий код умеет работать только с одним входным файлом и не содержит конвертера, в реализации нужно
заложить абстракцию `"SourcePreprocessor"` с ветками `"PdfSourcePreprocessor"` и `"DjvuSourcePreprocessor"`.

## Content Assembly Rules

### Headers

Header-блоки исключаются из итоговой книги полностью. Они могут сохраняться только в диагностических промежуточных
данных, чтобы не терять информацию при анализе качества OCR.

### Body

Body-контент страницы является единственным источником основного текста книги. Markdown разметка должна
конвертироваться в HTML с сохранением:

- заголовков;
- абзацев;
- списков;
- таблиц, если OCR их возвращает;
- встроенных изображений.

### Footers and Endnotes

Для Kindle Paperwhite предпочтителен перенос footer-сносок в конец книги как endnotes, а не попытка сохранить их как
постраничные footnotes, потому что reflowable MOBI не сохраняет понятие исходной страницы как стабильной визуальной
единицы. Поэтому выбранный дизайн:

- footer не включается в поток текста страницы;
- каждая сноска получает глобальный порядковый идентификатор;
- в body вставляется якорь-ссылка на endnote там, где обнаружен маркер сноски;
- в разделе endnotes формируется список примечаний в порядке появления;
- каждая запись endnote содержит backlink к месту вызова, если сопоставление удалось;
- несопоставленные footer-записи добавляются в конец раздела как несвязанные примечания.

Это решение лучше переносится в Kindle-ридер, чем попытка сохранять исходную пагинацию.

### Images

Изображения извлекаются из OCR-ответа, записываются в `images/` и затем встраиваются в HTML/ebook-пакет через
относительные ссылки. Если OCR markdown уже содержит image placeholders, они заменяются на ссылки на локальные файлы.

Приоритет для изображений:

1. сохранить сам файл;
2. сохранить размер и координаты, если они нужны для адаптивной верстки;
3. встроить изображение рядом с соответствующим body-блоком.

## Book Packaging

Рекомендуемая схема сборки:

1. Нормализованный markdown/HTML собирается в единую HTML-книгу.
2. Формируются endnotes и навигационные якоря.
3. Создаются служебные ebook-файлы пакета, необходимые выбранному инструменту сборки.
4. HTML и изображения упаковываются в MOBI.

Так как текущая реализация останавливается на HTML, пакетирование нужно выделить в отдельный модуль, например
`"book_packager.py"`, чтобы логика OCR и логика ebook-сборки были изолированы.

## State Management and Resume

`state.json` должен хранить:

- путь к исходному файлу;
- фактический нормализованный формат источника;
- текущий этап;
- `file_id` или эквивалентный идентификатор внешнего OCR-ресурса;
- пути к артефактам;
- ошибки и предупреждения последнего шага.

Возобновление работы должно опираться на наличие уже готовых артефактов, а не повторять этапы без необходимости.

## Error Handling

Ошибки делятся на:

- ошибки валидации ввода;
- ошибки OCR API;
- ошибки декодирования изображений;
- ошибки построения итоговой книги;
- ошибки файловой системы.

Для каждого класса ошибок система должна:

- завершать текущий этап с понятным сообщением;
- сохранять диагностические артефакты;
- не удалять job directory автоматически при сбое.

## Test Strategy

### Unit Tests

- `tests/unit/test_input_validation.py` - проверяет валидацию входного формата и путей.
- `tests/unit/test_job_state.py` - проверяет сохранение и загрузку состояния пайплайна.
- `tests/unit/test_page_normalization.py` - проверяет выделение body, header, footer.
- `tests/unit/test_endnotes.py` - проверяет перенос сносок и генерацию ссылок.
- `tests/unit/test_image_extraction.py` - проверяет декодирование и сохранение изображений.
- `tests/unit/test_html_builder.py` - проверяет сборку HTML из нормализованной модели страниц.
- `tests/unit/test_mobi_packager.py` - проверяет формирование пакета для итоговой книги.

### Functional Tests

- `tests/functional/test_cli_conversion.py` - запускает CLI на fixture OCR-ответа и проверяет итоговые артефакты.
- `tests/functional/test_resume_pipeline.py` - проверяет дозапуск с середины пайплайна.
- `tests/functional/test_endnotes_generation.py` - проверяет поведение сносок в итоговой книге.
- `tests/functional/test_fixture_loading.py` - подтверждает работу без сетевого вызова.

### OCR Test Fixture Strategy

Тестовая книга берется из `tests/assets/`. Для нее должен существовать один сохраненный OCR fixture, полученный
однократным реальным вызовом "MistralOCR". Далее:

- fixture хранится в репозитории или в согласованном кэш-каталоге тестов;
- unit и functional tests используют fixture по умолчанию;
- live OCR test не запускается автоматически в обычном `pytest`;
- отдельный подготовительный сценарий может регенерировать fixture вручную.

Это исключает нестабильность тестов, лишние сетевые вызовы и стоимость повторной OCR-обработки.

### Requirements Coverage

| Requirement | Unit Tests | Functional Tests |
|-------------|------------|-------------------|
| book-converter.1 | `tests/unit/test_input_validation.py` | `tests/functional/test_cli_validation.py`, `tests/functional/test_cli_conversion.py` |
| book-converter.2 | `tests/unit/test_job_state.py` | `tests/functional/test_job_directory.py`, `tests/functional/test_resume_pipeline.py` |
| book-converter.3 | `tests/unit/test_ocr_client.py` | `tests/functional/test_mistral_fixture_pipeline.py`, `tests/functional/test_mistral_api_error.py` |
| book-converter.4 | `tests/unit/test_page_normalization.py` | `tests/functional/test_page_content_selection.py`, `tests/functional/test_empty_page_blocks.py` |
| book-converter.5 | `tests/unit/test_endnotes.py` | `tests/functional/test_endnotes_generation.py`, `tests/functional/test_endnotes_links.py`, `tests/functional/test_unmatched_footnotes.py` |
| book-converter.6 | `tests/unit/test_image_extraction.py` | `tests/functional/test_image_extraction.py`, `tests/functional/test_image_embedding.py`, `tests/functional/test_broken_image_payload.py` |
| book-converter.7 | `tests/unit/test_mobi_packager.py`, `tests/unit/test_html_builder.py` | `tests/functional/test_mobi_output.py`, `tests/functional/test_kindle_navigation.py` |
| book-converter.8 | `tests/unit/test_fixture_loader.py` | `tests/functional/test_fixture_loading.py`, `tests/functional/test_no_live_api_in_default_tests.py` |
