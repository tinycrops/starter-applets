# INFERENCE_PROMPT: Deeper Video Insight Prompt

**Prompt Location:** [video-watcher/server/video-processor.mjs](//starter-applets/video-watcher/server/video-processor.mjs#L28)

---

```
Analyze this screen recording to identify both explicit statements and infer the user's underlying mental state, intentions, and tacit knowledge. Go beyond the literal content to provide deeper insights.

Focus on:
1.  **Explicit Directives & Preferences:** Commands (implicit/explicit) for an AI, stated preferences, goals, or expressed frustrations.
2.  **Inferred User State & Intentions:** Interpret the user's actions and words to deduce:
    *   **Mental/Emotional State:** Signs of confusion, focus, frustration, satisfaction, contemplation, cognitive load, etc. (e.g., "User seems hesitant", "User sounds frustrated with the loading time").
    *   **Underlying Goals/Motivations:** What is the user *really* trying to achieve, even if not stated? (e.g., "Appears to be learning [Software X]", "Trying to optimize their workflow for task Y").
    *   **Unspoken Needs/Desires:** What might the user want or need based on their actions? (e.g., "User seems to be looking for a shortcut", "Might benefit from an explanation of [Concept Z]").
    *   **Observed Workflow/Habits:** Patterns in how the user interacts with the system or performs tasks (e.g., "Prefers using keyboard shortcuts", "Methodically checks settings before proceeding", "Often multi-tasks between App A and App B").
    *   **Potential Knowledge Gaps:** Areas where the user seems uncertain or lacks information (e.g., "Unsure how feature X works", "Searching for basic commands").
    *   **Implied Opinions/Critiques:** Subtle judgments about tools, processes, or outcomes, even if not voiced directly (e.g., "Seems unimpressed by the tool's speed", "Appears to implicitly prefer Tool A over Tool B for this task").
    *   **Withheld Recommendations/Ideas:** Potential improvements or alternative approaches the user might be considering but not stating (e.g., "Might be thinking about automating this step", "Considering a different tool for the next step").

Guidelines for analysis:
1. Focus on making reasonable inferences based on evidence in the video
2. Include a basis or reasoning for each inference to explain your thinking
3. Rate your certainty for each insight (high/medium/low)
4. Be specific and actionable rather than vague
5. Look for patterns in the user's behavior, language, and screen interactions

Structure the response as a JSON object:
{
  "explicit_directives": [
    { 
      "command": "The specific instruction or command detected", 
      "target": "What/who the command is directed to", 
      "parameters": {"param1": "value1"}, 
      "certainty": "high/medium/low", 
      "context": "Description of when/how this directive was given" 
    }
  ],
  "explicit_statements": [
    { 
      "statement": "The explicit statement made by the user", 
      "type": "preference/goal/frustration/interest/question", 
      "certainty": "high/medium/low", 
      "context": "Description of when/how this statement was made" 
    }
  ],
  "inferred_insights": [
    { 
      "insight": "The inferred insight about the user's state, goals, needs, etc.", 
      "type": "mental_state/goal/need/workflow/knowledge_gap/opinion/withheld_idea", 
      "basis": "The specific observation or pattern that led to this inference", 
      "certainty": "high/medium/low" 
    }
  ],
  "relevant_context_summary": "Brief summary of the video focusing on aspects most relevant to understanding the user's current state and goals."
}

If no significant explicit items or inferences can be made, return empty arrays for the respective fields but provide the context summary. Be specific in the 'basis' field for inferences. 