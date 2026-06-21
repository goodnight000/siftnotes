import React from "react";
import Image from "next/image";

interface LogoProps {
    isCollapsed: boolean;
}

const Logo = React.forwardRef<HTMLDivElement, LogoProps>(({ isCollapsed }, ref) => {
  return (
    <div
      ref={ref}
      aria-label="SiftNotes"
      className={
        isCollapsed
          ? "flex items-center justify-center mb-2"
          : "mb-3 flex items-center gap-2 px-2 py-1.5"
      }
    >
      <Image
        src="/brand/siftnotes-mark.png"
        alt="SiftNotes logo"
        width={isCollapsed ? 40 : 32}
        height={isCollapsed ? 40 : 32}
        className="shrink-0"
        priority
      />
      {!isCollapsed && (
        <span className="text-lg font-semibold text-gray-800 leading-none">
          SiftNotes
        </span>
      )}
    </div>
  );
});

Logo.displayName = "Logo";

export default Logo;
