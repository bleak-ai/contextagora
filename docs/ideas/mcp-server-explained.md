  What the MCP Server is (and isn't)                                                             
                                                                                                 
  It's not a UI. It's a tool layer that sits between the AI agent and the modules. The agent     
  calls it programmatically instead of reading raw files.                                       
                                                                                                 
  Without MCP (current File Browser approach)                                                    
                                                                                                
  User picks modules via web UI                                                                  
    → Files land in /context/linear/, /context/supabase/  
    → Agent reads files directly from disk                                                       
    → Agent has no way to load more modules mid-conversation                                     
    → Agent doesn't know what other modules exist                                                
                                                                                                 
  The agent just sees files. It works, but it's passive — the agent can't interact with the      
  module system.                                                                                
                                                                                                 
  With MCP Server (inside the container)                                                         
                                                                                                
  User picks modules via web UI (same as before)                                                 
    → MCP server runs inside the container              
    → Agent connects to MCP as a tool provider                                                  
    → Agent can call tools like:                                                                 
   
       list_available_modules()                                                                  
       → ["linear", "supabase", "jira", "slack", "stripe"]
                                                                                                 
       load_module("jira")                              
       → pulls jira module into /context, injects secrets, returns summary                       
                                                                                                 
       get_module_docs("linear", "authentication")                                               
       → returns specific doc section without loading everything                                 
                                                                                                 
  Concrete example                                                                              
                                                                                                 
  User: "Check Linear ticket SUP-123 and figure out what DB changes are needed"
                                                                                                 
  Agent thinking:
    1. I have linear module loaded, let me check the ticket                                      
    2. The ticket mentions a Stripe webhook table                                                
    3. I don't have a stripe module... let me check what's available                            
                                                                                                 
  Agent calls: list_available_modules()                                                          
    → sees "stripe" is available                                                                 
                                                                                                 
  Agent calls: load_module("stripe")                                                             
    → stripe docs + secrets now available                                                       
                                                                                                 
  Agent: "I loaded the Stripe module. The ticket needs a new                                     
          webhook_events table. Here's the migration..."                                        
                                                                                                 
  Without MCP, the agent would just say "I don't have information about Stripe" and the user     
  would have to manually add the module through the UI and tell the agent to look again.         
                                                                                                 
  Does it make sense with the web UI?                                                            
                                                                                                
  Yes — they're complementary:                                                                   
                                                        
  ┌─────────────┬──────────────────────────┬────────────────────────────┐                        
  │             │          Web UI          │         MCP Server         │
  ├─────────────┼──────────────────────────┼────────────────────────────┤                        
  │ Who uses it │ Human                    │ Agent                      │
  ├─────────────┼──────────────────────────┼────────────────────────────┤                       
  │ When        │ Session start            │ Mid-conversation           │
  ├─────────────┼──────────────────────────┼────────────────────────────┤                        
  │ Purpose     │ Initial module selection │ Dynamic loading + querying │
  └─────────────┴──────────────────────────┴────────────────────────────┘                        
                                                        
  The web UI is for humans picking their starting context. The MCP server lets the agent be smart
   about discovering and loading more context on its own.
                                                                                                 
  When it doesn't make sense                            
                                                                                                
  If your sessions are short and users always know exactly what modules they need upfront, MCP is
   overkill. The file-on-disk approach is simpler and works fine.
                                                                                                 
  MCP becomes worth it when: agents need to self-serve modules mid-conversation, you want lazy   
  loading (summaries first, full docs on demand), or you want the agent to understand the module
  system itself (not just read files).                                                           
                                                        