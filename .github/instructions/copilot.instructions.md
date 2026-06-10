---
description: This instruction emphasizes the importance of robust error handling in the code, particularly in the context of UI loading. It suggests that when an error occurs during the UI loading process, a user-friendly message should be displayed to inform the user of the issue, while the detailed error information should be logged for developers to debug and resolve the problem effectively.

# applyTo: 'Describe when these instructions should be loaded by the agent based on task context' # when provided, instructions will automatically be added to the request context when the pattern matches an attached file
---

<!-- Tip: Use /create-instructions in chat to generate content with agent assistance -->
Please provide more error handling in the code in general.

If an error occurs during the loading of the UI, display a user-friendly message and log the error details for debugging purposes because users cannot see anything when the UI fails to load.

Please write comments in English for internationalization purposes.

Also, I'd like you to write comments to explain how the functions work, what data they get and return.