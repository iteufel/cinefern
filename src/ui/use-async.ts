import { useEffect, useRef, useState } from 'react';
export function useAsync<T>(key: string, load: () => Promise<T>) {
  const loader = useRef(load);
  loader.current = load;
  const [attempt, setAttempt] = useState(0);
  const [value, setValue] = useState<{
    data?: T;
    error?: string;
    loading: boolean;
  }>({ loading: true });
  useEffect(() => {
    let current = true;
    setValue({ loading: true });
    void loader
      .current()
      .then((data) => {
        if (current) setValue({ data, loading: false });
      })
      .catch((error) => {
        if (current)
          setValue({
            error: String(error).replace(/^Error: /, ''),
            loading: false,
          });
      });
    return () => {
      current = false;
    };
  }, [key, attempt]);
  return { ...value, retry: () => setAttempt((a) => a + 1) };
}
