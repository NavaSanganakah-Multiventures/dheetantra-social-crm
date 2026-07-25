import re

with open("app/dashboard/page.tsx", "r") as f:
    content = f.read()

# Since stopMicTest is used in useEffect, React requires it to be wrapped in useCallback if we pass it,
# or we just disable the eslint rule for this specific line since it's just a cleanup and we know
# stopMicTest doesn't need to trigger re-renders.

search = '''  // Cleanup on unmount
  useEffect(() => {
      return () => {
          stopMicTest();
      };
  }, []);'''

replace = '''  // Cleanup on unmount
  useEffect(() => {
      return () => {
          stopMicTest();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);'''

content = content.replace(search, replace)

with open("app/dashboard/page.tsx", "w") as f:
    f.write(content)
