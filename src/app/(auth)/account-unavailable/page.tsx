export default function AccountUnavailable() {
  return (
    <>
      <h1 className="text-xl font-semibold text-navy-900">Your account is not active</h1>
      <p className="mt-2 text-sm text-slate-ink">Your sign-in worked, but your Hub account is suspended or has not been activated. Please contact the Provincial Mentoring Team at mentor@hertfordshirefreemasons.org.uk.</p>
      <form action="/auth/signout" method="post" className="mt-6"><button className="text-sm text-navy-700 underline underline-offset-2">Sign out</button></form>
    </>
  );
}
