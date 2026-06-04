export default async () => {
  return {
    "experimental.chat.system.transform": async (
      _input: unknown,
      output: { system: string[] }
    ) => {
      output.system = output.system.filter(
        s => !s.startsWith("Instructions from:")
      )
    }
  }
}
