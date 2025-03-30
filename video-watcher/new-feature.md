add another call to gemini-2.0-flash that sends the transcript of the most recently processed video.
the prompt will be something like
"check this transcript for commands from the user."
this command will also update the memory log for the user.

The memory log is a running list of all the things the user has done.  we will budget 8k tokens for this short term memory.  

when the token limit is reached, use another api call to gemini-2.0-flash that summarizes 3k tokens of short term memory and writes it to long term memory.  

every time short term memory is updated, summarize short term memory and long term memory into 'working memory'.  'working memory' has three tiers of user understanding.  untested short working memory is where the newest understanding of the user will be stored. 'tested working memory' is where untested working memory will be moved once it is tested.  'solid working memory' is where the most certain details of understanding will be stored.

this pipeline will be the start of a deeply personolized pipeline for users who want an assistant that grows to understand them the more they interact with the assistant.