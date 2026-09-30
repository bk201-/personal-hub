import { createStyles } from 'antd-style';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const useStyles = createStyles(({ css, token }) => ({
  description: css`
    overflow-wrap: anywhere;
    white-space: pre-wrap;
    & p { margin: 0 0 8px; }
    & pre { overflow-x: auto; padding: 8px; background: ${token.colorFillAlter}; }
    & blockquote { margin: 8px 0; padding-left: 12px; border-left: 3px solid ${token.colorBorder}; }
    & ul, & ol { padding-left: 20px; }
    & a { color: ${token.colorLink}; }
  `,
}));

const plugins = [remarkGfm];
const allowedElements = ['p', 'br', 'strong', 'em', 'del', 'code', 'pre', 'blockquote', 'ul', 'ol', 'li', 'a'];
const components = {
  a: ({ href, children }: React.ComponentProps<'a'>) =>
    href ? (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    ) : (
      <span>{children}</span>
    ),
};
const safeUrl = (url: string) => (/^(https?:\/\/|mailto:)/i.test(url) ? url : '');

export function ChannelDescription({ description }: { description: string }) {
  const { styles } = useStyles();
  return (
    <div className={styles.description}>
      <ReactMarkdown
        remarkPlugins={plugins}
        allowedElements={allowedElements}
        unwrapDisallowed
        components={components}
        urlTransform={safeUrl}
      >
        {description}
      </ReactMarkdown>
    </div>
  );
}
