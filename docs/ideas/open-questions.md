  Module Lifecycle                                                                               
  - How are modules versioned? If you update a module in the registry, do running sessions get
  the update or stay on the version they started with?                                           
  - Who can create/publish modules? Is there an approval process or can any team member push to
  the registry?                                                                                  
  - How do you handle module dependencies? (e.g., a "support-workflow" task module that requires 
  both linear and supabase modules)                                                               
                                                                                                 
  Container Management                                  
  - What's the container lifecycle? Idle timeout? Max lifetime? How do you prevent resource      
  sprawl?                                                                                        
  - Is there any state that persists between sessions (conversation history, agent memory, user 
  files)?                                                                                        
  - How do you handle container startup latency? Pre-warming? Base images?                       
                                                                                                
  Security & Multi-tenancy                                                                       
  - Network isolation — can a container reach arbitrary external services, or is egress locked
  down per module?                                                                               
  - What happens if the agent leaks a secret into its output (chat response, generated file)?
  Varlock handles injection, but is there output filtering?                                      
  - RBAC — who decides which users can access which modules? Where is that defined?              
                                                                                                
  Agent Integration                                                                              
  - Which coding agent exactly? Claude Code, opencode, or user's choice? That affects how you
  inject context and how /load-module commands work.                                             
  - How does the agent know a module exists but isn't loaded yet? Does it see a list of available
   (unloaded) modules, or only what's already in /context?                                       
  - Token budget cap is mentioned but not specified — who sets it, per-module or global?         
                                                                                                
  Operations                                                                                     
  - Monitoring/logging — how do you observe what's happening across containers?
  - Cost model — containers + AI API calls per user adds up. Any limits or metering?             
  - Backup/recovery — if the registry (git/S3) goes down, what happens to running sessions?
                                                                                                 
  The biggest architectural question I see: the relationship between the MCP server approach and 
  the File Browser UI. The doc proposes both but doesn't clarify how they interact. Does the MCP 
  server serve the module picker UI? Does File Browser become read-only once the MCP server      
  manages loading? These two paths need to converge into one story.                              
                                                                                                
  Want me to formalize any of these into a requirements checklist or update the tech doc?        