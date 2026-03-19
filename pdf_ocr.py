import markdown
import re
import os
import sys
import tempfile
import argparse
import json
import base64

from pathlib import Path
from typing import Optional, Dict, Any

from dotenv import load_dotenv
from mistralai import Mistral

class BookPipeline:
    def __init__(self,
        pdf_path: str,
        client: Mistral,
        model: str = 'mistral-ocr-latest',
        job_dir: Optional[str] = None,
    ):
        self.pdf_path = pdf_path
        self.model = model
        self.job_dir: Path = Path(job_dir) if job_dir else Path(tempfile.mkdtemp(prefix="mistral_ocr_"))
        self.state: Dict[str, Any] = {}
        self.client: Mistral = client
        self._ocr_response: Optional[dict] = None

    @property
    def state_path(self):
        return self.job_dir / "state.json"

    @property
    def osr_response_path(self)-> Path:
        return  self.job_dir / "ocr_response.json"

    @property
    def osr_response(self)-> dict:
        if self._ocr_response is None:
            with open(self.osr_response_path, "r", encoding="utf-8") as f:
                self._ocr_response = json.load(f)
        return self._ocr_response


    @property
    def image_path(self)-> Path:
        res = self.job_dir / "images"
        res.mkdir(exist_ok=True)
        return res

    @property
    def html_path(self)-> Path:
        return self.job_dir / "content.html"

    def _save_state(self):
        """Saves the current pipeline state to a JSON file."""
        with open(self.state_path, "w", encoding="utf-8") as f:
            json.dump(self.state, f, ensure_ascii=False, indent=2)


    def _load_state(self):
        """Loads the pipeline state from a JSON file."""
        if not self.state_path.exists():
            self.state = {}
            return
        else:
            with open(self.state_path, "r", encoding="utf-8") as f:
                self.state = json.load(f)


    def _validate_file(self):
        pdf_path = Path(self.state["pdf_path"])
        if not pdf_path.exists():
            raise FileNotFoundError(f"File {pdf_path} not found.")
        print(f"Step 1: File validated ({pdf_path.name})")
        self.state["step"] = 2
        self._save_state()

    def _upload_file(self):
        pdf_path = Path(self.state["pdf_path"])
        print(f"Step 2: Uploading {pdf_path.name} to Mistral...")
        with open(pdf_path, "rb") as f:
            uploaded_file = self.client.files.upload(
                file={"file_name": pdf_path.name, "content": f},
                purpose="ocr"
            )
        self.state["file_id"] = uploaded_file.id
        self.state["step"] = 3
        print(f"Log: file_id = {self.state['file_id']}")
        self._save_state()

    def _request_ocr(self):
        file_id = self.state["file_id"]
        print(f"Step 3: Sending OCR request for file_id: {file_id} (include_image_base64=True)...")

        ocr_response = self.client.ocr.process(
            model=self.model,
            document={
                "type": "file",
                "file_id": file_id,
            },
            table_format='html',
            include_image_base64=True,
            extract_header=True,
            extract_footer=True,
        )

        self._ocr_response = ocr_response.model_dump()

        with open(self.osr_response_path, "w", encoding="utf-8") as f:
            json.dump(ocr_response.model_dump(), f, ensure_ascii=False, indent=2)

        self.state["step"] = 4
        self._save_state()
        print(f"OCR process completed. Raw JSON saved to {self.osr_response_path}")

    def _extract_images(self):
        """Extracts base64 images from the OCR response and saves them to disk."""
        print("Step 4: Extracting images...")

        count = 0
        for page in self.osr_response.get("pages", []):
            for img_info in page.get("images", []):
                img_id = img_info.get("id")
                base64_data = img_info.get("image_base64")

                if img_id and base64_data:
                    img_path = self.image_path / img_id
                    # Clean base64 data if it contains a data URI prefix
                    if "," in base64_data:
                        base64_data = base64_data.split(",")[1]

                    with open(img_path, "wb") as f:
                        f.write(base64.b64decode(base64_data))
                    count += 1

        print(f"Log: Extracted {count} images to { self.image_path}")
        self.state["step"] = 5
        self._save_state()

    def _convert_md_to_html(self):
        # Collect image metadata for all images
        image_metadata = {}
        md = markdown.Markdown(extensions=['extra', 'attr_list'])
        with open(self.html_path, "w", encoding="utf-8") as html_f:
            html_f.write("<html><body>\n")
            for page in self.osr_response.get('pages', []):
                html_f.write(f"<section id='page-{page['index']}'>")

                md_text = page['markdown']

                for img in page['images']:
                    width = img['bottom_right_x']-img["top_left_x"]
                    height = img['bottom_right_y']-img["top_left_y"]

                    md_text = md_text.replace(
                        f"![{img['id']}]({img['id']})",
                        f"""<img src="images/{img['id']}" alt="{img['id']}" height="{height}" width="{width}" />"""
                    )

                html_content = md.convert(md_text)
                html_f.write(html_content)
                html_f.write(f"</section>\n")

            html_f.write("</body></html>\n")

        print(f"Converted Markdown to HTML")
        self.state["step"] = 6
        self._save_state()

    def handle(self):
        """Orchestrates the pipeline steps."""
        # --- Setup Directory and State --

        if not self.job_dir.exists():
            print(f"Error: Provided job directory {self.job_dir} does not exist.")
            sys.exit(1)

        self._load_state()
        if self.state.get('step') is None:
            self.state = {"pdf_path": self.pdf_path, "step": 1}
            self._save_state()
        else:
            print(f"Resuming job from: {self.job_dir}")


        try:
            if self.state.get("step") == 1:
                self._validate_file()

            if self.state.get("step") == 2:
                self._upload_file()

            if self.state.get("step") == 3:
                self._request_ocr()

            if self.state.get("step") == 4:
                self._extract_images()

            if self.state.get("step") == 5:
                self._convert_md_to_html()

            print("\nPipeline finished successfully.")
            print(f"Final artifacts are in: {self.job_dir}")

        except Exception as e:
            print(f"\nPipeline failed at Step {self.state.get('step')}: {e}")
            print(f"You can resume by providing: --job-dir {self.job_dir}")
            sys.exit(1)

def main():
    load_dotenv()
    parser = argparse.ArgumentParser(description="Step-by-step OCR PDF using Mistral AI")
    parser.add_argument("pdf_path", type=str, help="Path to the PDF file")
    parser.add_argument("--model", type=str, default="mistral-ocr-2512", help="Mistral OCR model name")
    parser.add_argument("--job-dir", type=str, help="Resume from an existing job directory")
    args = parser.parse_args()

    api_key = os.getenv("MISTRAL_API_KEY")
    if not api_key:
        print("Error: MISTRAL_API_KEY not found.")
        sys.exit(1)

    client = Mistral(api_key=api_key)
    with client:
        pipeline = BookPipeline(
            pdf_path=args.pdf_path,
            model=args.model,
            job_dir=args.job_dir,
            client=client
        )
        pipeline.handle()

if __name__ == "__main__":
    main()
