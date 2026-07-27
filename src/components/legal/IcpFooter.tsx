import Link from "next/link";

export const ICP_FILING_NUMBER = "京ICP备2026025115号-3";

export function IcpFooter({ className = "" }: { className?: string }) {
  return (
    <footer
      className={`font-sans-sc text-center text-[11px] leading-5 ${className}`}
    >
      <Link
        className="transition-opacity hover:opacity-100"
        href="https://beian.miit.gov.cn/"
        target="_blank"
        rel="noopener noreferrer"
      >
        {ICP_FILING_NUMBER}
      </Link>
    </footer>
  );
}
