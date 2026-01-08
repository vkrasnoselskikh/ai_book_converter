import os
import sys
import tempfile
import argparse
import json
from pathlib import Path
from typing import Optional, Dict, Any

from dotenv import load_dotenv
from mistralai import Mistral

class BookPipeline:
    def __init__(self,
        pdf_path: str,
        client: Mistral,
        model: str = 'mistral-ocr-2512',
        job_dir: Optional[str] = None,

    ):
        self.pdf_path = pdf_path
        self.model = model
        self.job_dir = Path(job_dir) if job_dir else None
        self.state: Dict[str, Any] = {}
        self.client: Mistral = client

    def _create_job_dir(self) -> Path:
        """Creates a persistent temporary directory for the OCR job."""
        tmp_dir = tempfile.mkdtemp(prefix="mistral_ocr_")
        return Path(tmp_dir)

    def _save_state(self):
        """Saves the current pipeline state to a JSON file."""
        if self.job_dir:
            state_path = self.job_dir / "state.json"
            with open(state_path, "w", encoding="utf-8") as f:
                json.dump(self.state, f, ensure_ascii=False, indent=2)

    def _load_state(self):
        """Loads the pipeline state from a JSON file."""
        if self.job_dir:
            state_path = self.job_dir / "state.json"
            if state_path.exists():
                with open(state_path, "r", encoding="utf-8") as f:
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
        if not self.client:
            raise RuntimeError("Mistral client not initialized")

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
        print(f"Step 3: Sending OCR request for file_id: {file_id}...")
        if not self.client:
            raise RuntimeError("Mistral client not initialized")

        ocr_response = self.client.ocr.process(
            model=self.model,
            document={
                "type": "file",
                "file_id": file_id,
            }
        )

        # Extract data for JSON persistence
        if hasattr(ocr_response, "model_dump"):
            raw_data = ocr_response.model_dump()
        else:
            # Fallback for older SDK versions or different object structures
            raw_data = json.loads(ocr_response.json()) if hasattr(ocr_response, "json") else str(ocr_response)

        if not self.job_dir:
             raise RuntimeError("Job directory not initialized")

        response_path = self.job_dir / "ocr_response.json"
        with open(response_path, "w", encoding="utf-8") as f:
            json.dump(raw_data, f, ensure_ascii=False, indent=2)

        self.state["step"] = 4
        self._save_state()
        print("OCR process completed successfully.")


    def handle(self):
        """Orchestrates the pipeline steps."""


        # --- Setup Directory and State ---
        if self.job_dir:
            if not self.job_dir.exists():
                print(f"Error: Provided job directory {self.job_dir} does not exist.")
                sys.exit(1)
            print(f"Resuming job from: {self.job_dir}")
            self._load_state()
        else:
            self.job_dir = self._create_job_dir()
            print(f"Created new job directory: {self.job_dir}")
            self.state = {"pdf_path": self.pdf_path, "step": 1}
            self._save_state()

        try:
            if self.state.get("step") == 1:
                self._validate_file()

            if self.state.get("step") == 2:
                self._upload_file()

            if self.state.get("step") == 3:
                self._request_ocr()


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
