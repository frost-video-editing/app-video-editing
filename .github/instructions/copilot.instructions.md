---
description: This instruction emphasizes the importance of robust error handling in the code, particularly in the context of UI loading. It suggests that when an error occurs during the UI loading process, a user-friendly message should be displayed to inform the user of the issue, while the detailed error information should be logged for developers to debug and resolve the problem effectively.

applyTo: '*/*'
---

<!-- Tip: Use /create-instructions in chat to generate content with agent assistance -->
Please provide more error handling in the code in general.

Please write every comment and message in English for internationalization purposes.

If an error occurs during the loading of the UI, display a user-friendly message and log the error details for debugging purposes because users cannot see anything when the UI fails to load.

Please write comments in English for internationalization purposes.

Also, I'd like you to write comments to explain how the functions work, what data they get and return.

The error handling should be comprehensive, covering all possible failure points in the code to ensure that users are informed of issues and developers have sufficient information for debugging.

Additionally, ensure that any asynchronous operations have proper error handling mechanisms, such as try-catch blocks or promise rejection handlers, to prevent unhandled exceptions from crashing the application.

Finally, consider implementing a centralized error handling strategy, where all errors are captured, logged, and appropriately communicated to the user, to maintain consistency and improve maintainability across the codebase.