from os import getenv
import pytest
from mistralai import Mistral
from pdf_ocr import BookPipeline

file = "/Users/user/Library/CloudStorage/GoogleDrive-v.krasnoselskikh.im@gmail.com/My Drive/Книги/Паттерны разработки на Python - TDD, DDD и событийно-ориентированная архитектура (Гарри Персиваль, Боб Грегори).pdf"
test_dir = '/var/folders/8b/kq_29d4n26qbfhjjc0np7l8m0000gn/T/mistral_ocr_90ey7pci'

def test_pipe():
    client = Mistral(api_key=getenv('MISTRAL_API_KEY'))
    with client:
        pipeline = BookPipeline(
            pdf_path=file,
            client=client,
            job_dir=test_dir
        )
        pipeline.handle()
