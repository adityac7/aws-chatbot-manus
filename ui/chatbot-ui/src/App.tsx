import React, { useState, useEffect } from 'react';
import { Amplify } from 'aws-amplify';
import { Authenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import ChatInterface from './components/ChatInterface';
import { ThemeProvider } from "@/components/theme-provider";
import './App.css';

// Configure Amplify
const configureAmplify = () => {
  Amplify.configure({
    Auth: {
      region: process.env.REACT_APP_AWS_REGION || 'us-east-1',
      userPoolId: process.env.REACT_APP_USER_POOL_ID,
      userPoolWebClientId: process.env.REACT_APP_USER_POOL_CLIENT_ID,
      mandatorySignIn: true,
    },
    API: {
      endpoints: [
        {
          name: 'chatbotApi',
          endpoint: process.env.REACT_APP_API_URL,
          region: process.env.REACT_APP_AWS_REGION || 'us-east-1',
        },
      ],
    },
  });
};

function App() {
  useEffect(() => {
    configureAmplify();
  }, []);

  return (
    <ThemeProvider defaultTheme="system" storageKey="chatbot-theme">
      <Authenticator>
        {({ signOut, user }) => (
          <div className="min-h-screen bg-background">
            <header className="border-b p-4">
              <div className="container mx-auto flex justify-between items-center">
                <h1 className="text-2xl font-bold">Text-to-SQL Chatbot</h1>
                <div className="flex items-center gap-4">
                  <span className="text-sm text-muted-foreground">
                    Signed in as {user.attributes.email}
                  </span>
                  <button
                    onClick={signOut}
                    className="px-3 py-1 text-sm bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90"
                  >
                    Sign Out
                  </button>
                </div>
              </div>
            </header>
            
            <main className="container mx-auto py-8">
              <ChatInterface />
            </main>
            
            <footer className="border-t p-4 mt-8">
              <div className="container mx-auto text-center text-sm text-muted-foreground">
                &copy; {new Date().getFullYear()} Text-to-SQL Chatbot. All rights reserved.
              </div>
            </footer>
          </div>
        )}
      </Authenticator>
    </ThemeProvider>
  );
}

export default App;
