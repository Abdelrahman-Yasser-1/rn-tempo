import { NextRequest, NextResponse } from 'next/server';
import { isMarkdownPreferred, rewritePath } from 'fumadocs-core/negotiation';
import { docsContentRoute, docsRoute } from '@/lib/shared';

const { rewrite: rewriteDocs } = rewritePath(
  `${docsRoute}{/*path}`,
  `${docsContentRoute}{/*path}/content.md`,
);
const { rewrite: rewriteSuffix } = rewritePath(
  `${docsRoute}{/*path}.mdx`,
  `${docsContentRoute}{/*path}/content.md`,
);

export default function proxy(request: NextRequest) {
  const bySuffix = rewriteSuffix(request.nextUrl.pathname);
  if (bySuffix) {
    return NextResponse.rewrite(new URL(bySuffix, request.nextUrl));
  }

  if (isMarkdownPreferred(request)) {
    const byAccept = rewriteDocs(request.nextUrl.pathname);
    if (byAccept) {
      return NextResponse.rewrite(new URL(byAccept, request.nextUrl));
    }
  }

  return NextResponse.next();
}
