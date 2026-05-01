import React from "react";

interface Props {
    text: string;
    className?: string;
}

export default function RichText({ text, className }: Props) {
    if (!text) return <div className={className} />;

    // Split by newlines first
    const lines = text.split("\n");

    return (
        <div className={className}>
            {lines.map((line, i) => (
                <div key={i} className="min-h-[1.2em]">
                    {renderLine(line)}
                </div>
            ))}
        </div>
    );
}

function renderLine(line: string) {
    // Standard regex for superscript (^) and subscript (_)
    // Support: ^2, ^{2}, _2, _{2}
    // Single character by default, use {} for multiple
    const parts = line.split(/(\^\{[^{}]+\}|\^[\w\d]|_\{[^{}]+\}|_[\w\d])/g);

    return parts.map((part, index) => {
        if (part.startsWith("^")) {
            const content = part.startsWith("^{") ? part.slice(2, -1) : part.slice(1);
            return <sup key={index} className="text-[0.75em] leading-[0] align-baseline relative top-[-0.4em]">{content}</sup>;
        }
        if (part.startsWith("_")) {
            const content = part.startsWith("_{") ? part.slice(2, -1) : part.slice(1);
            return <sub key={index} className="text-[0.75em] leading-[0] align-baseline relative bottom-[-0.2em]">{content}</sub>;
        }
        return <span key={index}>{part}</span>;
    });
}
