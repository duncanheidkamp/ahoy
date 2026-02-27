export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type FriendshipStatus = 'pending' | 'accepted' | 'declined'

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          username: string
          fcm_token: string | null
          created_at: string
        }
        Insert: {
          id: string
          username: string
          fcm_token?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          username?: string
          fcm_token?: string | null
          created_at?: string
        }
        Relationships: []
      }
      friendships: {
        Row: {
          id: string
          requester_id: string
          addressee_id: string
          status: FriendshipStatus
          created_at: string
        }
        Insert: {
          id?: string
          requester_id: string
          addressee_id: string
          status?: FriendshipStatus
          created_at?: string
        }
        Update: {
          id?: string
          requester_id?: string
          addressee_id?: string
          status?: FriendshipStatus
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'friendships_requester_id_fkey'
            columns: ['requester_id']
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'friendships_addressee_id_fkey'
            columns: ['addressee_id']
            referencedRelation: 'users'
            referencedColumns: ['id']
          }
        ]
      }
      ahoys: {
        Row: {
          id: string
          sender_id: string
          receiver_id: string
          phrase: string
          created_at: string
        }
        Insert: {
          id?: string
          sender_id: string
          receiver_id: string
          phrase?: string
          created_at?: string
        }
        Update: {
          id?: string
          sender_id?: string
          receiver_id?: string
          phrase?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'ahoys_sender_id_fkey'
            columns: ['sender_id']
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ahoys_receiver_id_fkey'
            columns: ['receiver_id']
            referencedRelation: 'users'
            referencedColumns: ['id']
          }
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      are_friends: {
        Args: { user1_id: string; user2_id: string }
        Returns: boolean
      }
      get_ahoy_count: {
        Args: { user_id: string }
        Returns: number
      }
    }
    Enums: {
      friendship_status: FriendshipStatus
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

// Helper types
export type User = Database['public']['Tables']['users']['Row']
export type Friendship = Database['public']['Tables']['friendships']['Row']
export type Ahoy = Database['public']['Tables']['ahoys']['Row']

// Extended types for UI
export interface FriendWithUser extends Friendship {
  friend: User
}

export interface FriendRequest extends Friendship {
  requester: User
  addressee: User
}

export interface UserWithAhoyCount extends User {
  ahoyCount?: number
}
