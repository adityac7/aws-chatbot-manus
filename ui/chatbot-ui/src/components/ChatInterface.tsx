import React, { useState, useEffect } from 'react';
import { Auth } from 'aws-amplify';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Send, History, Database, RefreshCw } from "lucide-react";

const ChatInterface = () => {
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const [activeTab, setActiveTab] = useState('chat');

  // Fetch conversation history on component mount
  useEffect(() => {
    fetchConversationHistory();
  }, []);

  const fetchConversationHistory = async () => {
    try {
      const user = await Auth.currentAuthenticatedUser();
      const token = (await Auth.currentSession()).getIdToken().getJwtToken();
      
      const response = await fetch(`${process.env.REACT_APP_API_URL}/history`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setHistory(data.conversations || []);
      }
    } catch (error) {
      console.error('Error fetching conversation history:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!query.trim()) return;
    
    try {
      setLoading(true);
      
      // Add user message to chat
      const userMessage = {
        type: 'user',
        content: query,
        timestamp: new Date().toISOString()
      };
      
      setMessages(prev => [...prev, userMessage]);
      
      // Get current user
      const user = await Auth.currentAuthenticatedUser();
      const token = (await Auth.currentSession()).getIdToken().getJwtToken();
      
      // Send query to API
      const response = await fetch(`${process.env.REACT_APP_API_URL}/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          query,
          userId: user.username
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        
        // Add system message with pending status
        const systemMessage = {
          type: 'system',
          content: 'Processing your query...',
          conversationId: data.conversationId,
          status: 'pending',
          timestamp: new Date().toISOString()
        };
        
        setMessages(prev => [...prev, systemMessage]);
        
        // Poll for results
        pollForResults(data.conversationId, user.username, token);
      } else {
        throw new Error('Failed to submit query');
      }
      
      // Clear input
      setQuery('');
    } catch (error) {
      console.error('Error submitting query:', error);
      
      // Add error message
      const errorMessage = {
        type: 'system',
        content: `Error: ${error.message}`,
        status: 'error',
        timestamp: new Date().toISOString()
      };
      
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const pollForResults = async (conversationId, userId, token) => {
    try {
      // Poll for results every 2 seconds
      const pollInterval = setInterval(async () => {
        const response = await fetch(`${process.env.REACT_APP_API_URL}/result/${conversationId}`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          
          if (data.status === 'COMPLETED') {
            clearInterval(pollInterval);
            
            // Update system message with results
            setMessages(prev => 
              prev.map(msg => 
                msg.conversationId === conversationId
                  ? {
                      ...msg,
                      content: formatResults(data),
                      status: 'completed',
                      resultCount: data.resultCount
                    }
                  : msg
              )
            );
            
            // Refresh conversation history
            fetchConversationHistory();
          } else if (data.status === 'FAILED') {
            clearInterval(pollInterval);
            
            // Update system message with error
            setMessages(prev => 
              prev.map(msg => 
                msg.conversationId === conversationId
                  ? {
                      ...msg,
                      content: `Error: ${data.error || 'Query execution failed'}`,
                      status: 'error'
                    }
                  : msg
              )
            );
          }
        }
      }, 2000);
      
      // Stop polling after 2 minutes if no response
      setTimeout(() => {
        clearInterval(pollInterval);
      }, 120000);
    } catch (error) {
      console.error('Error polling for results:', error);
    }
  };

  const formatResults = (data) => {
    if (!data.rows || data.rows.length === 0) {
      return 'No results found for your query.';
    }
    
    return (
      <div className="results-container">
        <p className="text-sm text-muted-foreground mb-2">
          Found {data.resultCount} results
        </p>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {data.columns.map((column, i) => (
                  <th key={i} className="border p-2 bg-muted text-left">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row, i) => (
                <tr key={i}>
                  {data.columns.map((column, j) => (
                    <td key={j} className="border p-2">
                      {row[column]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const loadConversation = (conversation) => {
    // Add the selected conversation to the chat
    const historyMessage = {
      type: 'history',
      content: `Query: ${conversation.Query}`,
      timestamp: new Date(conversation.Timestamp).toISOString(),
      conversationId: conversation.ConversationId
    };
    
    setMessages(prev => [...prev, historyMessage]);
    
    // If the conversation has results, add them too
    if (conversation.ResultStatus === 'COMPLETED') {
      const resultMessage = {
        type: 'system',
        content: `Results: ${conversation.ResultCount} rows found`,
        status: 'completed',
        timestamp: new Date(conversation.Timestamp).toISOString(),
        conversationId: conversation.ConversationId
      };
      
      setMessages(prev => [...prev, resultMessage]);
    }
    
    // Switch to chat tab
    setActiveTab('chat');
  };

  return (
    <div className="container mx-auto p-4 max-w-4xl">
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-xl font-bold">Text-to-SQL Chatbot</CardTitle>
        </CardHeader>
        
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="chat">Chat</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>
          
          <TabsContent value="chat" className="p-0">
            <CardContent className="p-4">
              <ScrollArea className="h-[400px] pr-4">
                {messages.map((message, index) => (
                  <div
                    key={index}
                    className={`mb-4 p-3 rounded-lg ${
                      message.type === 'user'
                        ? 'bg-primary text-primary-foreground ml-12'
                        : message.type === 'system'
                          ? 'bg-muted mr-12'
                          : 'bg-secondary mr-12'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium">
                        {message.type === 'user' ? 'You' : message.type === 'history' ? 'History' : 'Chatbot'}
                      </span>
                      <span className="text-xs opacity-70">
                        {new Date(message.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    
                    <div className="message-content">
                      {message.status === 'pending' ? (
                        <div className="flex items-center">
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          {message.content}
                        </div>
                      ) : (
                        message.content
                      )}
                    </div>
                  </div>
                ))}
              </ScrollArea>
            </CardContent>
            
            <CardFooter>
              <form onSubmit={handleSubmit} className="w-full flex gap-2">
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Ask a question about your data..."
                  disabled={loading}
                  className="flex-1"
                />
                <Button type="submit" disabled={loading || !query.trim()}>
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </form>
            </CardFooter>
          </TabsContent>
          
          <TabsContent value="history">
            <CardContent className="p-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium">Conversation History</h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchConversationHistory}
                  className="flex items-center gap-1"
                >
                  <RefreshCw className="h-4 w-4" />
                  Refresh
                </Button>
              </div>
              
              <ScrollArea className="h-[400px] pr-4">
                {history.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    No conversation history yet
                  </p>
                ) : (
                  history.map((conversation, index) => (
                    <Card key={index} className="mb-3 cursor-pointer hover:bg-muted/50 transition-colors">
                      <CardContent className="p-3" onClick={() => loadConversation(conversation)}>
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <p className="font-medium truncate">{conversation.Query}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(conversation.Timestamp).toLocaleString()}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 text-xs">
                            {conversation.ResultStatus === 'COMPLETED' ? (
                              <>
                                <Database className="h-3 w-3 text-green-500" />
                                <span>{conversation.ResultCount} results</span>
                              </>
                            ) : (
                              <span className="text-muted-foreground">No results</span>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </ScrollArea>
            </CardContent>
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  );
};

export default ChatInterface;
