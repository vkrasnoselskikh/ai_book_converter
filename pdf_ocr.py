import os
import sys
import tempfile
import argparse
import json
from pathlib import Path
from typing import Optional, Dict, Any

from dotenv import load_dotenv
from mistralai import Mistral

def create_job_dir() -> Path:
    """Creates a persistent temporary directory for the OCR job."""
    tmp_dir = tempfile.mkdtemp(prefix="mistral_ocr_")
    return Path(tmp_dir)

def save_state(job_dir: Path, state: Dict[str, Any]):
    """Saves the current pipeline state to a JSON file."""
    state_path = job_dir / "state.json"
    with open(state_path, "w", encoding="utf-8") as f:
        json.dump(state, f, ensure_ascii=False, indent=2)

def load_state(job_dir: Path) -> Dict[str, Any]:
    """Loads the pipeline state from a JSON file."""
    state_path = job_dir / "state.json"
    if state_path.exists():
        with open(state_path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}

def main():
    parser = argparse.ArgumentParser(description="Step-by-step OCR PDF using Mistral AI")
    parser.add_argument("pdf_path", type=str, help="Path to the PDF file")
    parser.add_argument("--model", type=str, default="mistral-ocr-2512", help="Mistral OCR model name")
    parser.add_argument("--job-dir", type=str, help="Resume from an existing job directory")
    args = parser.parse_args()

    load_dotenv()
    api_key = os.getenv("MISTRAL_API_KEY")

    if not api_key:
        print("Error: MISTRAL_API_KEY not found.")
        sys.exit(1)

    client = Mistral(api_key=api_key)

    # --- STEP 0: Setup Directory and State ---
    if args.job_dir:
        job_dir = Path(args.job_dir)
        if not job_dir.exists():
            print(f"Error: Provided job directory {args.job_dir} does not exist.")
            sys.exit(1)
        print(f"Resuming job from: {job_dir}")
        state = load_state(job_dir)
    else:
        job_dir = create_job_dir()
        print(f"Created new job directory: {job_dir}")
        state = {"pdf_path": args.pdf_path, "step": 1}
        save_state(job_dir, state)

    try:
        # --- STEP 1: Validate File ---
        if state.get("step") == 1:
            pdf_path = Path(state["pdf_path"])
            if not pdf_path.exists():
                print(f"Error: File {pdf_path} not found.")
                sys.exit(1)
            print(f"Step 1: File validated ({pdf_path.name})")
            state["step"] = 2
            save_state(job_dir, state)

        # --- STEP 2: Upload to Mistral ---
        if state.get("step") == 2:
            pdf_path = Path(state["pdf_path"])
            print(f"Step 2: Uploading {pdf_path.name} to Mistral...")
            with open(pdf_path, "rb") as f:
                uploaded_file = client.files.upload(
                    file={"file_name": pdf_path.name, "content": f},
                    purpose="ocr"
                )
            state["file_id"] = uploaded_file.id
            state["step"] = 3
            print(f"Log: file_id = {state['file_id']}")
            save_state(job_dir, state)

        # --- STEP 3: Request OCR ---
        if state.get("step") == 3:
            file_id = state["file_id"]
            print(f"Step 3: Sending OCR request for file_id: {file_id}...")
            ocr_response = client.ocr.process(
                model=args.model,
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

            state["ocr_raw_response"] = raw_data
            state["step"] = 4
            save_state(job_dir, state)
            print("OCR process completed successfully.")

        # --- STEP 4: Persist JSON Response ---
        if state.get("step") == 4:
            print("Step 4: Saving raw JSON response...")
            response_path = job_dir / "ocr_response.json"
            with open(response_path, "w", encoding="utf-8") as f:
                json.dump(state["ocr_raw_response"], f, ensure_ascii=False, indent=2)

            state["response_file"] = str(response_path)
            state["step"] = 5 # Completed steps 1-4
            save_state(job_dir, state)
            print(f"Log: Raw JSON saved to {response_path}")

        print("\nPipeline finished successfully.")
        print(f"Final artifacts are in: {job_dir}")

    except Exception as e:
        print(f"\nPipeline failed at Step {state.get('step')}: {e}")
        print(f"You can resume by providing: --job-dir {job_dir}")
        sys.exit(1)

if __name__ == "__main__":
    main()
