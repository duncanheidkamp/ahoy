# Ahoy - CLAUDE.md

## Overview

**Ahoy** is a nautical-themed clone of the "Yo" app - a radically simple messaging app where users send a single "Ahoy" notification to friends with one tap.

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Auth & Database**: Supabase (Auth + Postgres)
- **Push Notifications**: Firebase Cloud Messaging (FCM)
- **Styling**: Tailwind CSS
- **Hosting**: Prepared for Vercel deployment

## Getting Started

### 1. Install Dependencies
```bash
cd ahoy
npm install
```

### 2. Set Up Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to SQL Editor and run the contents of `database-schema.sql`
3. Copy your project URL and keys from Settings > API

### 3. Set Up Firebase

1. Create a project at [Firebase Console](https://console.firebase.google.com)
2. Enable Cloud Messaging
3. Generate a web push certificate (VAPID key)
4. Get your server key from Project Settings > Cloud Messaging

### 4. Configure Environment Variables

Copy `.env.local.example` to `.env.local` and fill in:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Firebase
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
FIREBASE_SERVER_KEY=your_server_key

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 5. Run the App
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Project Structure

```
ahoy/
├── app/
│   ├── (auth)/           # Auth pages (login, signup)
│   │   ├── login/
│   │   └── signup/
│   ├── api/              # API routes
│   │   ├── ahoys/send/   # Send ahoy + push notification
│   │   └── users/fcm-token/
│   ├── dashboard/        # Main friends list
│   ├── requests/         # Friend requests
│   ├── search/           # Find users
│   ├── layout.tsx
│   ├── page.tsx
│   └── globals.css
├── components/
│   ├── ui/               # Reusable UI components
│   │   ├── button.tsx
│   │   ├── input.tsx
│   │   └── card.tsx
│   ├── friends/          # Friend-related components
│   │   ├── friend-card.tsx
│   │   └── friend-list.tsx
│   ├── notifications/    # Push notification components
│   │   ├── notification-prompt.tsx
│   │   └── service-worker-register.tsx
│   └── navigation.tsx
├── lib/
│   ├── supabase/         # Supabase client config
│   │   ├── client.ts
│   │   ├── server.ts
│   │   ├── middleware.ts
│   │   └── types.ts
│   ├── firebase/         # Firebase config
│   │   ├── config.ts
│   │   └── notifications.ts
│   └── utils/
│       └── index.ts
├── public/
│   ├── icons/            # PWA icons
│   ├── manifest.json     # PWA manifest
│   ├── sw.js            # Service worker
│   ├── firebase-messaging-sw.js
│   └── offline.html
├── database-schema.sql   # Supabase schema
├── middleware.ts         # Auth middleware
└── .env.local.example
```

## Database Schema

### users
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | References auth.users |
| username | text | Unique, lowercase |
| fcm_token | text | Firebase push token |
| created_at | timestamp | |

### friendships
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | |
| requester_id | uuid | Who sent the request |
| addressee_id | uuid | Who received the request |
| status | enum | pending, accepted, declined |
| created_at | timestamp | |

### ahoys
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | |
| sender_id | uuid | |
| receiver_id | uuid | |
| phrase | text | Default 'Ahoy!' |
| created_at | timestamp | |

## Core Features

### Authentication
- Email/password signup with username selection
- Username validation (lowercase, 3-20 chars, alphanumeric + underscores)
- Session management via Supabase Auth

### Friends System
- Search users by username
- Send/accept/decline friend requests
- Copy shareable invite link

### Ahoy Sending
- One-tap send from friends list
- Records ahoy in database (for future unlockables)
- Sends push notification via FCM
- Visual feedback animation

### Push Notifications
- Permission prompt on first dashboard visit
- Background message handling
- "Ahoy back" action button in notification

### PWA
- Installable on mobile home screens
- Offline support with cached pages
- App-like standalone mode

## Design System

### Colors
- **Ocean**: #0c4a6e, #0369a1
- **Teal**: #0d9488, #14b8a6
- **Wood**: #78350f, #92400e
- **Brass/Gold**: #d97706, #f59e0b
- **Parchment**: #fef3c7, #fffbeb

### Typography
- Headers: Georgia, serif
- Body: Geist (system-ui fallback)

## Future Features (Architected For)

### Unlockable Phrases
The `ahoys.phrase` column supports future phrase unlocks:
- 500 ahoys: "Ope!"
- 1000 ahoys: "You betcha!"
- 2000 ahoys: "Avast!"
- 5000 ahoys: "Land ho!"
- 10000 ahoys: "Yarr, she blows!"

Use `get_ahoy_count(user_id)` function to check progress.

### Sound Effects
Space for pirate voice clips on send/receive.

### Native Apps
API routes are ready for mobile app integration.

## Deployment

### Vercel
1. Connect GitHub repo to Vercel
2. Add environment variables in Vercel dashboard
3. Deploy

### Manual Build
```bash
npm run build
npm start
```

## Troubleshooting

### Push notifications not working
1. Check Firebase server key is correct
2. Ensure user has granted notification permission
3. Check browser console for FCM errors

### Auth redirects not working
1. Verify Supabase URL and keys
2. Check middleware.ts is configured correctly

### Database errors
1. Ensure schema is applied in Supabase
2. Check RLS policies allow the operation
