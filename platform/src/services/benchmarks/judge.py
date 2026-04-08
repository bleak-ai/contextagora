from __future__ import annotations

import subprocess


def judge(judge_prompt: str, agent_output: str, timeout_s: int = 120) -> tuple[str, str]:
    """Run a headless claude call to judge whether the agent output satisfies
    the judge prompt. Returns (verdict, reason) where verdict ∈ {pass,fail,error}.
    """
    full_prompt = (
        f"{judge_prompt}\n\n"
        f"--- AGENT OUTPUT START ---\n{agent_output}\n--- AGENT OUTPUT END ---\n"
    )
    try:
        proc = subprocess.run(
            ["claude", "-p", full_prompt],
            capture_output=True,
            text=True,
            timeout=timeout_s,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired) as e:
        return "error", f"judge call failed: {e}"
    if proc.returncode != 0:
        return "error", f"judge exited {proc.returncode}: {proc.stderr.strip()[:200]}"
    line = (proc.stdout or "").strip().splitlines()[-1] if proc.stdout.strip() else ""
    lower = line.lower()
    if lower.startswith("pass"):
        return "pass", line.split(":", 1)[1].strip() if ":" in line else line
    if lower.startswith("fail"):
        return "fail", line.split(":", 1)[1].strip() if ":" in line else line
    return "error", f"unparseable judge reply: {line[:200]}"
