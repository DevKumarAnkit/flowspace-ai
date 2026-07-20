import Link from "next/link";
export default function NotFound() { return <div className="template-route-error"><h2>App not found</h2><p>This app may have been deleted or belongs to another user.</p><Link href="/ai-template-builder">Back to Template Builder</Link></div>; }
