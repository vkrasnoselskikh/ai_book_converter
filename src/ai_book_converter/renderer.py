from __future__ import annotations

import logging
import shutil
import zipfile
from html import escape
from pathlib import Path

import markdown

from ai_book_converter.errors import OutputPackagingError
from ai_book_converter.job import JobPaths
from ai_book_converter.models import BookMetadata, Endnote, PageContent, PageImage, PageTable, TocEntry


logger = logging.getLogger(__name__)


# Requirements: book-converter.4, book-converter.5, book-converter.6, book-converter.7
def render_body_sections(pages: list[PageContent], image_href_prefix: str) -> str:
    rendered_sections: list[str] = []
    for page in pages:
        page_markdown = _replace_table_placeholders(page.body_markdown, page.tables)
        page_markdown = _replace_image_placeholders(page_markdown, page.images, image_href_prefix)
        page_html = markdown.markdown(page_markdown, extensions=["extra", "attr_list"])
        page_html = _normalize_image_sources(page_html, image_href_prefix)
        rendered_sections.append(f'<section id="page-{page.page_index}">\n{page_html}\n</section>')
    return "\n\n".join(rendered_sections)


# Requirements: book-converter.5, book-converter.7
def render_endnotes_html(endnotes: list[Endnote]) -> str:
    if not endnotes:
        return ""
    lines = ['<section id="endnotes">', "<h2>Endnotes</h2>", "<ol>"]
    for endnote in endnotes:
        backlink = f' <a href="#{endnote.ref_id}">↩</a>' if endnote.linked else ""
        marker = f"[{endnote.marker}] " if endnote.marker is not None else ""
        lines.append(f'<li id="{endnote.note_id}">{marker}{endnote.text}{backlink}</li>')
    lines.extend(["</ol>", "</section>"])
    return "\n".join(lines)


# Requirements: book-converter.4, book-converter.5, book-converter.6, book-converter.7
def render_book_html(body_html: str, endnotes_html: str) -> str:
    return "\n".join(
        [
            "<html>",
            "<body>",
            body_html,
            endnotes_html,
            "</body>",
            "</html>",
        ]
    )


# Requirements: book-converter.4, book-converter.5, book-converter.6, book-converter.7
def render_book_xhtml(title: str, body_html: str, endnotes_html: str) -> str:
    return "\n".join(
        [
            '<?xml version="1.0" encoding="utf-8"?>',
            '<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en">',
            "<head>",
            f"<title>{escape(title)}</title>",
            '<meta http-equiv="Content-Type" content="text/html; charset=utf-8" />',
            "</head>",
            "<body>",
            body_html,
            endnotes_html,
            "</body>",
            "</html>",
        ]
    )


# Requirements: book-converter.4, book-converter.5, book-converter.6, book-converter.7
def render_cover_xhtml(metadata: BookMetadata) -> str:
    subtitle_html = (
        f'<p class="cover-subtitle">{escape(metadata.cover_subtitle)}</p>'
        if metadata.cover_subtitle
        else ""
    )
    authors_html = ""
    if metadata.authors:
        authors_html = "\n".join(
            f'<p class="cover-author">{escape(author)}</p>' for author in metadata.authors
        )
    return "\n".join(
        [
            '<?xml version="1.0" encoding="utf-8"?>',
            '<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en">',
            "<head>",
            f"<title>{escape(metadata.title)}</title>",
            '<meta http-equiv="Content-Type" content="text/html; charset=utf-8" />',
            "</head>",
            '<body class="cover-page">',
            '<section id="cover">',
            f'<h1 class="cover-title">{escape(metadata.title)}</h1>',
            subtitle_html,
            authors_html,
            "</section>",
            "</body>",
            "</html>",
        ]
    )


# Requirements: book-converter.2, book-converter.4, book-converter.5, book-converter.7
def write_book_artifacts(
    job_paths: JobPaths,
    body_html: str,
    endnotes_html: str,
    content_html: str,
    content_xhtml: str,
    cover_xhtml: str,
) -> None:
    job_paths.body_markdown_path.write_text(body_html, encoding="utf-8")
    job_paths.endnotes_markdown_path.write_text(endnotes_html, encoding="utf-8")
    job_paths.content_html_path.write_text(content_html, encoding="utf-8")
    job_paths.content_xhtml_path.write_text(content_xhtml, encoding="utf-8")
    job_paths.cover_xhtml_path.write_text(cover_xhtml, encoding="utf-8")


# Requirements: book-converter.7
def publish_output(job_paths: JobPaths, output_path: Path, metadata: BookMetadata) -> Path:
    suffix = output_path.suffix.lower()
    if suffix in {"", ".html"}:
        return _publish_html_output(job_paths, output_path)
    if suffix == ".epub":
        return _publish_epub_output(job_paths, output_path, metadata)
    raise OutputPackagingError(f"Unsupported output format: {output_path.suffix}")


# Requirements: book-converter.7
def _publish_html_output(job_paths: JobPaths, output_path: Path) -> Path:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    image_output_dir = output_path.parent / f"{output_path.stem}_images"
    if image_output_dir.exists():
        shutil.rmtree(image_output_dir)
    shutil.copytree(job_paths.images_dir, image_output_dir)
    html_text = job_paths.content_html_path.read_text(encoding="utf-8")
    html_text = html_text.replace("../images/", f"./{image_output_dir.name}/")
    output_path.write_text(html_text, encoding="utf-8")
    return output_path


# Requirements: book-converter.7
def _publish_epub_output(job_paths: JobPaths, output_path: Path, metadata: BookMetadata) -> Path:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    _write_epub_support_files(job_paths, metadata)
    _sync_epub_images(job_paths)
    with zipfile.ZipFile(output_path, "w") as epub_archive:
        epub_archive.write(job_paths.mimetype_path, "mimetype", compress_type=zipfile.ZIP_STORED)
        for root_path in (
            job_paths.container_xml_path,
            job_paths.package_opf_path,
            job_paths.toc_ncx_path,
            job_paths.content_xhtml_path,
            job_paths.cover_xhtml_path,
        ):
            epub_archive.write(root_path, root_path.relative_to(job_paths.epub_dir))
        for image_path in sorted(job_paths.epub_images_dir.iterdir()):
            if image_path.is_file():
                epub_archive.write(image_path, image_path.relative_to(job_paths.epub_dir))
    return output_path


# Requirements: book-converter.6, book-converter.7
def _sync_epub_images(job_paths: JobPaths) -> None:
    for image_path in job_paths.epub_images_dir.iterdir():
        if image_path.is_file():
            image_path.unlink()
    for image_path in sorted(job_paths.images_dir.iterdir()):
        if image_path.is_file():
            shutil.copy2(image_path, job_paths.epub_images_dir / image_path.name)


# Requirements: book-converter.7
def _write_epub_support_files(job_paths: JobPaths, metadata: BookMetadata) -> None:
    job_paths.mimetype_path.write_text("application/epub+zip", encoding="utf-8")
    job_paths.container_xml_path.write_text(_render_container_xml(), encoding="utf-8")
    job_paths.cover_xhtml_path.write_text(render_cover_xhtml(metadata), encoding="utf-8")
    manifest_items = _render_image_manifest(job_paths)
    spine_items = '\n'.join(['<itemref idref="cover" linear="yes" />', '<itemref idref="content" />'])
    job_paths.package_opf_path.write_text(
        _render_content_opf(metadata=metadata, manifest_items=manifest_items, spine_items=spine_items),
        encoding="utf-8",
    )
    job_paths.toc_ncx_path.write_text(_render_toc_ncx(metadata), encoding="utf-8")


# Requirements: book-converter.7
def _render_container_xml() -> str:
    return "\n".join(
        [
            '<?xml version="1.0" encoding="UTF-8"?>',
            '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">',
            "  <rootfiles>",
            '    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml" />',
            "  </rootfiles>",
            "</container>",
        ]
    )


# Requirements: book-converter.7
def _render_content_opf(metadata: BookMetadata, manifest_items: str, spine_items: str) -> str:
    author_lines = [
        f"    <dc:creator>{escape(author)}</dc:creator>"
        for author in metadata.authors
    ]
    metadata_lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid" version="2.0">',
        '  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">',
        "    <dc:identifier id=\"bookid\">ai-book-converter</dc:identifier>",
        f"    <dc:title>{escape(metadata.title)}</dc:title>",
        f"    <dc:language>{escape(metadata.language)}</dc:language>",
        *author_lines,
        "  </metadata>",
        "  <manifest>",
        '    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml" />',
        '    <item id="cover" href="cover.xhtml" media-type="application/xhtml+xml" />',
        '    <item id="content" href="content.xhtml" media-type="application/xhtml+xml" />',
        manifest_items,
        "  </manifest>",
        '  <spine toc="ncx">',
        f"    {spine_items}",
        "  </spine>",
        "  <guide>",
        '    <reference href="cover.xhtml" title="Cover" type="cover" />',
        '    <reference href="content.xhtml" title="Start" type="text" />',
        "  </guide>",
        "</package>",
    ]
    return "\n".join(metadata_lines)


# Requirements: book-converter.7
def _render_toc_ncx(metadata: BookMetadata) -> str:
    toc_entries = metadata.toc_entries
    nav_points = _render_nav_points(metadata.title, toc_entries)
    return "\n".join(
        [
            '<?xml version="1.0" encoding="UTF-8"?>',
            '<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">',
            "  <head>",
            '    <meta content="ai-book-converter" name="dtb:uid" />',
            '    <meta content="1" name="dtb:depth" />',
            '    <meta content="0" name="dtb:totalPageCount" />',
            '    <meta content="0" name="dtb:maxPageNumber" />',
            "  </head>",
            f"  <docTitle><text>{escape(metadata.title)}</text></docTitle>",
            "  <navMap>",
            nav_points,
            "  </navMap>",
            "</ncx>",
        ]
    )


# Requirements: book-converter.7
def _render_nav_points(book_title: str, toc_entries: list[TocEntry]) -> str:
    if not toc_entries:
        return "\n".join(
            [
                '    <navPoint id="navpoint-1" playOrder="1">',
                f"      <navLabel><text>{escape(book_title)}</text></navLabel>",
                '      <content src="content.xhtml" />',
                "    </navPoint>",
            ]
        )
    lines: list[str] = []
    for play_order, toc_entry in enumerate(toc_entries, start=1):
        anchor = f"page-{max(0, toc_entry.page_index)}"
        lines.extend(
            [
                f'    <navPoint id="navpoint-{play_order}" playOrder="{play_order}">',
                f"      <navLabel><text>{escape(toc_entry.title)}</text></navLabel>",
                f'      <content src="content.xhtml#{anchor}" />',
                "    </navPoint>",
            ]
        )
    return "\n".join(lines)


# Requirements: book-converter.6, book-converter.7
def _render_image_manifest(job_paths: JobPaths) -> str:
    lines: list[str] = []
    for index, image_path in enumerate(sorted(job_paths.images_dir.iterdir()), start=1):
        if not image_path.is_file():
            continue
        lines.append(
            '    <item id="image-{index}" href="images/{name}" media-type="{media_type}" />'.format(
                index=index,
                name=escape(image_path.name),
                media_type=_media_type_for_image(image_path),
            )
        )
    return "\n".join(lines)


# Requirements: book-converter.6, book-converter.7
def _media_type_for_image(image_path: Path) -> str:
    suffix = image_path.suffix.lower()
    if suffix == ".png":
        return "image/png"
    if suffix in {".jpg", ".jpeg"}:
        return "image/jpeg"
    if suffix == ".gif":
        return "image/gif"
    if suffix == ".svg":
        return "image/svg+xml"
    return "application/octet-stream"


# Requirements: book-converter.6, book-converter.7
def _replace_table_placeholders(markdown_text: str, tables: list[PageTable]) -> str:
    updated_markdown = markdown_text
    for table in tables:
        placeholder = f"[{table.table_id}]({table.table_id})"
        table_html = table.content_html.strip()
        if not table_html:
            continue
        updated_markdown = updated_markdown.replace(placeholder, f"\n\n{table_html}\n\n")
    return updated_markdown


# Requirements: book-converter.6, book-converter.7
def _replace_image_placeholders(
    markdown_text: str,
    images: list[PageImage],
    image_href_prefix: str,
) -> str:
    updated_markdown = markdown_text
    for image in images:
        image_name = Path(image.source_path).name
        placeholder = f"![{image.image_id}]({image.image_id})"
        markdown_image = f"![{image.image_id}]({image_href_prefix}/{image_name})"
        updated_markdown = updated_markdown.replace(placeholder, markdown_image)
    return updated_markdown


# Requirements: book-converter.6, book-converter.7
def _normalize_image_sources(rendered_html: str, image_href_prefix: str) -> str:
    normalized_html = rendered_html
    normalized_html = normalized_html.replace('src="../', 'src="')
    if image_href_prefix == "../images":
        return normalized_html
    return normalized_html.replace('src="images/', f'src="{image_href_prefix}/')
