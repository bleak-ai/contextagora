Rethink pieces of context as modules. 

How does a module look like. 


ContextModuleExample
 /info.md 
 llms.txt (contains references to each one of the docs)
 /docs/ 


Each Module has also some properties.

type:
    - integration
    - task
    - knowledge
    - repository
    ...

secrets: 
    - secrets needed to do a task. They are assigned per module, when a module is loaded these secrets are also loaded.
  

The APP is a CHAT to opencode / claude.
And every session / conversation loads a specific amount of context / knowledge.
The user has a set of context available for him and he can choose what he wants to enable for a specific session.



When enabled this is loaded as simple folders and claude code has access to it. For example like this. 


Example:
New Conversation:

- User chooses "LINEAR" and "supabase"

- Now opencode / claude have two integrations loaded, one for supabase and one for linear it looks like this.


context (what the AI can see)
/claude.md general intstruction for the agent
/context
    llms.txt = references to each file inside context
    info.md = general idea of what the user / organisation is
    supabase-module/ (loads secret env for supabase)
    linear-module/ (loads secret env for linear)


- Then when the user Ask a question. = Take a look at the ticket from linear SUP-123 and how to solve it. 
- The Agent sees that in context there is something for linear-module, it loads it and how to access, it has the env variables for it.
- Then the agent says something about to change a variable in a user. The agent looks again in the context, it sees that in 
  the supabase there is a db called users, it has to do an operation. To do so it creates a script in python with uv run to 
  execute it then it performs the operation and returns the info to the user