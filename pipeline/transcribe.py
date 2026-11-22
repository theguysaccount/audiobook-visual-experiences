"""Speech recognition with word timestamps (faster-whisper, CPU). Only the timing matters: the words are aligned to
the book's own text afterwards, so a small English model is enough."""
import os


class Transcriber:
    def __init__(self, model_name="base.en"):
        from faster_whisper import WhisperModel
        threads = int(os.environ.get("RA_THREADS", os.cpu_count() or 4))
        self.model = WhisperModel(model_name, device="cpu", compute_type="int8", cpu_threads=threads)

    def words(self, path):
        segments, info = self.model.transcribe(path, language="en", word_timestamps=True, vad_filter=True,
                                               beam_size=1, condition_on_previous_text=False)
        out = []
        for seg in segments:
            for w in seg.words or []:
                text = w.word.strip()
                if text:
                    out.append([round(float(w.start), 2), round(float(w.end), 2), text])
        return out, float(info.duration)
