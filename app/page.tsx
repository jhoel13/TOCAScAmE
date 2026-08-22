import { TrussApp } from "@/components/TrussApp";
import {
  chatGPTSignInPath,
  chatGPTSignOutPath,
  getChatGPTUser,
} from "./chatgpt-auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const authenticatedUser = await getChatGPTUser();
  const user = authenticatedUser
    ? { displayName: authenticatedUser.displayName, email: authenticatedUser.email }
    : null;

  return (
    <TrussApp
      user={user}
      signInPath={chatGPTSignInPath("/")}
      signOutPath={chatGPTSignOutPath("/")}
    />
  );
}
