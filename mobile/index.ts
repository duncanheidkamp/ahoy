// App entry. Push setup must run before the router so notification handlers,
// categories and the Android background task exist at module scope — also in
// the headless JS runtime Android uses for action buttons.
import './lib/push/bootstrap'
import 'expo-router/entry'
