import AuthForm from "@/components/AuthForm";
export default function Page() { return <AuthForm mode="signup" googleEnabled={!!process.env.GOOGLE_CLIENT_ID} />; }
