# Prompting Scheme Overview

This document provides an overview of the prompting scheme used in this system, which is designed to analyze user video recordings, extract insights, and manage a multi-tiered memory system for an AI assistant. The prompting architecture is modular, with each prompt type serving a specific role in the system's cognitive workflow.

## Core Prompt Types

### 1. Video Analysis Prompts
- **Default Video Analysis Prompt**: Instructs the AI to analyze a video recording and extract structured information, including a summary, screen content, actions, topics, transcript, and tags. The response is always structured as a JSON object for downstream processing.
- **Inference Video Analysis Prompt**: Goes beyond surface-level analysis to infer the user's mental state, intentions, tacit knowledge, and workflow patterns. It distinguishes between explicit directives/statements and inferred insights, rating certainty and providing evidence for each inference.
- **Batch Video Relevance Prompt**: Used to assess the relevance of multiple video analyses to a specific user query, scoring and justifying each video's relevance.
- **Video Chat Context Prompt**: Provides the AI with both video and memory context to enable informed, context-aware responses during user conversations about videos.

### 2. Memory Management Prompts
- **Working Memory (WM) Update Prompt**: Guides the AI to update the working memory by synthesizing recent short-term memory (STM) entries and long-term memory (LTM) patterns. WM is organized into untested hypotheses, corroborated hypotheses, and established facts, with explicit rules for promotion/demotion based on evidence.
- **LTM Summary Prompt**: Directs the AI to synthesize new observations into the user's long-term memory profile, merging, refining, and hierarchically structuring knowledge about skills, preferences, workflows, challenges, goals, and traits.
- **LTM Trimming Prompt**: Used when the LTM exceeds token limits, instructing the AI to condense the memory while preserving the most important and high-confidence insights.
- **Memory Portal Conversational Query Prompt**: Enables the AI to answer user queries about the memory system itself, explain how memory is processed, or provide transparent access to the current state of STM, WM, and LTM.

## Prompting Workflow and Interactions

- **Video Analysis**: When a new video is detected, the system first applies the default analysis prompt, then (optionally) the inference prompt for deeper insights. Results are parsed and stored in STM.
- **Memory Consolidation**: STM entries are periodically consolidated into LTM using the summary prompt. WM is updated to reflect the most relevant, actionable, and evidence-based insights for the current session.
- **Contextual Responses**: During user interactions (e.g., video chat), the AI is provided with both video and memory context to generate responses that are informed by the user's history and current state.
- **Memory Queries**: Users can query the memory system via the Memory Portal, receiving transparent, context-aware answers about their data and the system's reasoning.

## Design Principles

- **Structured Outputs**: All prompts require structured (usually JSON) responses to ensure consistency and facilitate downstream processing.
- **Evidence and Certainty**: Inferences and hypotheses are always accompanied by evidence and a certainty rating, supporting transparent and trustworthy AI reasoning.
- **Cognitive Hierarchy**: The memory system maintains a hierarchy from untested hypotheses to established facts, promoting or demoting insights as evidence accumulates.
- **Token Management**: Prompts for trimming and summarization ensure that memory representations remain within model token limits without losing critical information.

For the full text of each prompt and further details, see the individual files in this folder. 