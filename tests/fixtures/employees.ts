import { employeeSearchText } from "@/server/services/employee-invariants";
export function employeeFixtureFields(email: string, lastName = "Fixture") {
  const fields = { email, firstName: "Test", lastName };
  return { ...fields, searchText: employeeSearchText(fields) };
}
