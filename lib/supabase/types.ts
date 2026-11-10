export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type FriendshipStatus = 'pending' | 'accepted' | 'declined'
export type PushPlatform = 'ios' | 'android' | 'web'
export type SendAhoyFailure = 'not_friends' | 'blocked' | 'rate_limited' | 'invalid_request'

// Hand-maintained to match supabase/migrations. Regenerate with
//   npx supabase gen types typescript --local > lib/supabase/types.ts
// (then re-add the helper types at the bottom).

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          username: string
          /** Private: not readable by other users (column privileges). */
          fcm_token: string | null
          created_at: string
          /** Private: read via get_my_profile(), set via set_active_phrase(). */
          active_phrase_id: number
        }
        Insert: {
          id: string
          username: string
          fcm_token?: string | null
          created_at?: string
          active_phrase_id?: number
        }
        Update: {
          id?: string
          username?: string
          fcm_token?: string | null
          created_at?: string
          active_phrase_id?: number
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
          /** null once the receiver has deleted their account */
          receiver_id: string | null
          phrase: string
          created_at: string
        }
        Insert: {
          id?: string
          sender_id: string
          receiver_id: string | null
          phrase?: string
          created_at?: string
        }
        Update: {
          id?: string
          sender_id?: string
          receiver_id?: string | null
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
      /** service_role only (no client privileges) */
      friendship_notifications: {
        Row: {
          id: number
          friendship_id: string
          kind: 'request' | 'accepted'
          actor_id: string
          recipient_id: string
          pair_low: string
          pair_high: string
          created_at: string
        }
        Insert: {
          id?: never
          friendship_id: string
          kind: 'request' | 'accepted'
          actor_id: string
          recipient_id: string
          pair_low: string
          pair_high: string
          created_at?: string
        }
        Update: {
          id?: never
          friendship_id?: string
          kind?: 'request' | 'accepted'
          actor_id?: string
          recipient_id?: string
          pair_low?: string
          pair_high?: string
          created_at?: string
        }
        Relationships: []
      }
      feedback: {
        Row: {
          id: string
          user_id: string
          version: string
          message: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          version: string
          message: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          version?: string
          message?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'feedback_user_id_fkey'
            columns: ['user_id']
            referencedRelation: 'users'
            referencedColumns: ['id']
          }
        ]
      }
      push_tokens: {
        Row: {
          id: string
          user_id: string
          token: string
          platform: PushPlatform
          device_name: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          token: string
          platform: PushPlatform
          device_name?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          token?: string
          platform?: PushPlatform
          device_name?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'push_tokens_user_id_fkey'
            columns: ['user_id']
            referencedRelation: 'users'
            referencedColumns: ['id']
          }
        ]
      }
      blocks: {
        Row: {
          blocker_id: string
          blocked_id: string
          created_at: string
        }
        Insert: {
          blocker_id: string
          blocked_id: string
          created_at?: string
        }
        Update: {
          blocker_id?: string
          blocked_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'blocks_blocker_id_fkey'
            columns: ['blocker_id']
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'blocks_blocked_id_fkey'
            columns: ['blocked_id']
            referencedRelation: 'users'
            referencedColumns: ['id']
          }
        ]
      }
      phrases: {
        Row: {
          id: number
          text: string
          unlock_at: number
          secret: boolean
          sort: number
        }
        Insert: {
          id?: number
          text: string
          unlock_at?: number
          secret?: boolean
          sort?: number
        }
        Update: {
          id?: number
          text?: string
          unlock_at?: number
          secret?: boolean
          sort?: number
        }
        Relationships: []
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
      username_available: {
        Args: { p_username: string }
        Returns: boolean
      }
      register_push_token: {
        Args: { p_token: string; p_platform: PushPlatform; p_device_name?: string | null }
        Returns: string
      }
      my_sent_count: {
        Args: never
        Returns: number
      }
      get_my_profile: {
        Args: never
        Returns: {
          id: string
          username: string
          created_at: string
          active_phrase_id: number
          active_phrase: string
          has_fcm_token: boolean
        }[]
      }
      get_my_phrases: {
        Args: never
        Returns: {
          id: number
          text: string
          unlock_at: number
          secret: boolean
          sort: number
          unlocked: boolean
          active: boolean
        }[]
      }
      set_active_phrase: {
        Args: { phrase_id: number }
        Returns: undefined
      }
      get_my_stats: {
        Args: never
        /** Shape: MyStats */
        Returns: Json
      }
      get_friend_badges: {
        Args: never
        Returns: { friend_id: string; username: string; total_sent: number }[]
      }
      search_users: {
        Args: { p_query: string }
        Returns: { id: string; username: string; total_sent: number }[]
      }
      /** service_role only */
      can_send_ahoy: {
        Args: { p_sender: string; p_receiver: string }
        Returns: string | null
      }
      /** service_role only */
      record_ahoy: {
        Args: { p_sender: string; p_receiver: string }
        Returns: {
          ok: boolean
          reason: SendAhoyFailure | null
          ahoy_id: string | null
          phrase: string | null
          sender_username: string | null
        }[]
      }
      /** service_role only — used by the notify-friendship Edge Function */
      claim_friendship_notification: {
        Args: { p_caller: string; p_friendship_id: string }
        Returns: {
          ok: boolean
          reason: 'invalid_request' | 'not_found' | 'not_notifiable' | 'already_notified' | 'rate_limited' | null
          kind: 'request' | 'accepted' | null
          recipient_id: string | null
          actor_username: string | null
        }[]
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
export type UserRow = Database['public']['Tables']['users']['Row']
/** The columns any signed-in user can read about another user. */
export type User = Pick<UserRow, 'id' | 'username' | 'created_at'>
/** Comma-separated column list matching `User`, for .select(). Never use '*' on users. */
export const PUBLIC_USER_COLUMNS = 'id, username, created_at' as const
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
  ahoyCount?: number       // total ahoys this user has sent (for badges)
  myAhoysToThem?: number   // how many times the current user has sent to this friend
}

export type Feedback = Database['public']['Tables']['feedback']['Row']
export type Phrase = Database['public']['Functions']['get_my_phrases']['Returns'][number]
export type PushToken = Database['public']['Tables']['push_tokens']['Row']
export type Block = Database['public']['Tables']['blocks']['Row']

export interface MyStats {
  total_sent: number
  /** friend user id -> how many ahoys the caller has sent them */
  per_friend: Record<string, number>
}
