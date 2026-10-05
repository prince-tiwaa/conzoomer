import { Redirect } from "expo-router";

/** conzoomer://auth is where Google sign-in returns. The sign-in screen that
 *  opened the browser handles the result; this route just avoids a
 *  "page not found" if the link is opened on its own. */
export default function AuthReturn() {
  return <Redirect href="/account" />;
}
