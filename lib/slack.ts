// lib/slack.ts
interface SlackUser {
  id: string;
  profile: {
    email?: string;
    display_name?: string;
    real_name?: string;
  };
  is_bot: boolean;
  deleted: boolean;
}

interface SlackUsersListResponse {
  ok: boolean;
  members: SlackUser[];
  error?: string;
  response_metadata?: {
    next_cursor?: string;
  };
}

export interface SlackUserData {
  slackId: string;
  email: string;
  displayName: string;
}

export class SlackClient {
  private apiToken: string;
  private baseUrl: string = 'https://slack.com/api';

  constructor(apiToken: string) {
    this.apiToken = apiToken;
  }

  /**
   * Fetch all users from Slack
   */
  async fetchUsers(): Promise<SlackUserData[]> {
    try {
      console.log('Fetching Slack users...');
      
      const response = await fetch(`${this.baseUrl}/users.list`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json',
        },
      });

      console.log('Slack API response status:', response.status, response.statusText);

      // Check if response is ok
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Slack API HTTP error:', errorText);
        throw new Error(`Slack API request failed: ${response.status} ${response.statusText}`);
      }

      // Get response as text first to debug
      const responseText = await response.text();
      console.log('Slack API response length:', responseText.length);
      
      if (!responseText || responseText.trim() === '') {
        throw new Error('Slack API returned empty response');
      }

      // Try to parse JSON
      let data: SlackUsersListResponse;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error('JSON parse error. Response text:', responseText.substring(0, 500));
        throw new Error(`Failed to parse Slack API response: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`);
      }

      console.log('Slack API response parsed successfully');
      console.log('Response ok:', data.ok);
      console.log('Number of members:', data.members?.length || 0);

      if (!data.ok) {
        console.error('Slack API error:', data.error);
        throw new Error(`Slack API Error: ${data.error || 'Unknown error'}`);
      }

      if (!data.members || !Array.isArray(data.members)) {
        console.error('Invalid members data:', data);
        throw new Error('Slack API returned invalid members data');
      }

      // Filter and process users
      const userData: SlackUserData[] = data.members
        .filter(member => {
          // Exclude bots, deleted users, and users without email
          const hasEmail = member.profile && member.profile.email;
          const isValid = !member.is_bot && !member.deleted && hasEmail;
          
          if (!isValid) {
            console.log(`Filtering out user: bot=${member.is_bot}, deleted=${member.deleted}, hasEmail=${hasEmail}`);
          }
          
          return isValid;
        })
        .map(member => ({
          slackId: member.id,
          email: member.profile.email!.toLowerCase(), // Normalize to lowercase
          displayName: member.profile.display_name || member.profile.real_name || 'No Name',
        }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName)); // Sort alphabetically

      console.log(`Successfully processed ${userData.length} Slack users`);
      
      // Log first few users for debugging
      if (userData.length > 0) {
        console.log('Sample users:', userData.slice(0, 3).map(u => ({ 
          email: u.email, 
          displayName: u.displayName 
        })));
      }

      return userData;

    } catch (error) {
      console.error('Error fetching Slack users:', error);
      if (error instanceof Error) {
        throw error;
      } else {
        throw new Error('Unknown error fetching Slack users');
      }
    }
  }

  /**
   * Get Slack ID by email
   */
  async getSlackIdByEmail(email: string, users?: SlackUserData[]): Promise<string | null> {
    const normalizedEmail = email.toLowerCase();
    
    // If users array not provided, fetch it
    const slackUsers = users || await this.fetchUsers();
    
    const user = slackUsers.find(u => u.email === normalizedEmail);
    return user ? user.slackId : null;
  }

  /**
   * Get Slack ID by display name
   */
  async getSlackIdByName(name: string, users?: SlackUserData[]): Promise<string | null> {
    const normalizedName = name.toLowerCase();
    
    // If users array not provided, fetch it
    const slackUsers = users || await this.fetchUsers();
    
    const user = slackUsers.find(u => u.displayName.toLowerCase() === normalizedName);
    return user ? user.slackId : null;
  }

  /**
   * Test API connection
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/auth.test`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        return {
          success: false,
          message: `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      const data = await response.json();
      
      if (!data.ok) {
        return {
          success: false,
          message: data.error || 'Unknown error',
        };
      }

      return {
        success: true,
        message: `Connected to workspace: ${data.team || 'Unknown'}`,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

/**
 * Create a Slack client instance
 */
export function createSlackClient(): SlackClient {
  const apiToken = process.env.SLACK_API_TOKEN;
  
  if (!apiToken) {
    throw new Error('SLACK_API_TOKEN environment variable is not set');
  }

  return new SlackClient(apiToken);
}
