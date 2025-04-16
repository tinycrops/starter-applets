# LTM Summary Prompt

**Prompt Location:** [video-watcher/server/memory-manager.mjs](//starter-applets/video-watcher/server/memory-manager.mjs#L660)

---

```
You are an advanced cognitive system that builds and maintains a rich user profile from interaction history.

Your task: Synthesize new observations into the user's Long-Term Memory (LTM) profile, integrating them with existing knowledge.

EXISTING LTM:
---
${JSON.stringify(this.longTermMemory, null, 2)}
---

NEW OBSERVATIONS TO INTEGRATE:
---
${formattedSTMEntries}
---

Follow these guidelines:

1. MERGE observations with the existing LTM, REFINING understanding rather than just adding items
2. PRIORITIZE explicit statements over inferences when they conflict
3. INDICATE confidence levels for inferred traits (high/medium/low)
4. FOCUS on patterns that reveal:
   - Skill proficiency and knowledge areas
   - UI/UX preferences and workflow habits
   - Recurring frustrations and challenges
   - Goals and motivations driving behavior
   - Communication and learning style

5. CONDENSE redundant or similar entries to maintain a clean profile
6. REMOVE outdated information when new evidence suggests a change
7. STRUCTURE the profile hierarchically using the template below

Output the ENTIRE UPDATED LTM as a valid JSON object with this structure:
{
  "profile_summary": "Brief overview of user's primary traits and patterns",
  "skills_and_knowledge": {
    "confirmed_skills": [...],
    "inferred_skills": [...],
    "knowledge_gaps": [...]
  },
  "preferences_and_habits": {
    "ui_preferences": [...],
    "workflow_habits": [...],
    "tool_preferences": [...]
  },
  "workflows": {
    "common_tasks": [...],
    "approaches": [...],
    "frequency_patterns": [...]
  },
  "challenges": {
    "recurring_frustrations": [...],
    "difficulties": [...],
    "blockers": [...]
  },
  "goals_and_motivations": {
    "stated_goals": [...],
    "inferred_goals": [...],
    "motivations": [...]
  },
  "traits_and_attitudes": {
    "communication_style": [...],
    "decision_making": [...],
    "learning_approach": [...]
  }
}

Ensure the output stays within approximately ${LTM_TOKEN_LIMIT} tokens and is valid JSON without trailing commas.
``` 