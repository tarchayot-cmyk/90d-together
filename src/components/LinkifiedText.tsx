const URL_REGEX_SPLIT = /(https?:\/\/[^\s]+)/g;
const URL_REGEX_TEST = /^https?:\/\/[^\s]+$/;

export default function LinkifiedText({ text, className }: { text: string; className?: string }) {
  const parts = text.split(URL_REGEX_SPLIT);
  return (
    <p className={className}>
      {parts.map((part, i) =>
        URL_REGEX_TEST.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-us underline break-all"
            onClick={(e) => e.stopPropagation()}
          >
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </p>
  );
}
