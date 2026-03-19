from __future__ import annotations

from pathlib import Path

from ai_book_converter.job import create_job_paths, load_state, save_state
from ai_book_converter.models import PipelineState, PipelineStep


# Requirements: book-converter.2
def test_should_save_and_load_pipeline_state(tmp_path: Path) -> None:
    """Preconditions: A job directory exists.
    Action: Save a pipeline state and load it back.
    Assertions: The loaded state matches the stored values.
    Requirements: book-converter.2"""
    job_paths, auto_created = create_job_paths(tmp_path / "job")
    state = PipelineState(
        source_path="/tmp/source.pdf",
        output_path="/tmp/source.html",
        model="fixture-model",
        step=PipelineStep.NORMALIZED,
        auto_created_job_dir=auto_created,
        keep_temp=True,
        file_id="file-1",
        warnings=["warning"],
        errors=[],
    )
    save_state(job_paths, state)
    restored_state = load_state(job_paths)
    assert restored_state is not None
    assert restored_state.source_path == state.source_path
    assert restored_state.output_path == state.output_path
    assert restored_state.model == state.model
    assert restored_state.step == state.step
    assert restored_state.file_id == state.file_id
