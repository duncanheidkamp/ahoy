import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendPushNotification } from '@/lib/firebase/admin'

export async function POST(request: NextRequest) {
  try {
    const { receiverId, phrase = 'Ahoy!' } = await request.json()

    if (!receiverId) {
      return NextResponse.json({ error: 'Receiver ID required' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get sender's username
    const { data: sender } = await supabase
      .from('users')
      .select('username')
      .eq('id', user.id)
      .single()

    // Get receiver's FCM token
    const { data: receiver } = await supabase
      .from('users')
      .select('fcm_token, username')
      .eq('id', receiverId)
      .single()

    if (!receiver) {
      return NextResponse.json({ error: 'Receiver not found' }, { status: 404 })
    }

    // Record the ahoy in database
    await supabase.from('ahoys').insert({
      sender_id: user.id,
      receiver_id: receiverId,
      phrase,
    })

    // Send push notification if receiver has FCM token
    if (receiver.fcm_token) {
      const pushResult = await sendPushNotification(
        receiver.fcm_token,
        phrase,
        `@${sender?.username} sent you a${phrase === 'Ahoy!' ? 'n' : ''} ${phrase}`,
        {
          type: 'ahoy',
          senderId: user.id,
          senderUsername: sender?.username || '',
        }
      )

      console.log('Push notification result:', pushResult)
    } else {
      console.log('Receiver has no FCM token:', receiver.username)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error sending ahoy:', error)
    return NextResponse.json({ error: 'Failed to send ahoy' }, { status: 500 })
  }
}
