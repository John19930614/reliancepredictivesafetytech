"use client";

import { useMemo, useState } from "react";
import {
  BriefcaseBusiness,
  ChartNetwork,
  ChevronDown,
  CircleDollarSign,
  ListTree,
  Mail,
  MapPin,
  Phone,
  RotateCcw,
  Save,
  Search,
  UserPlus,
  Users,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  companyPositionDepartments,
  companyPositionEmploymentTypes,
  companyPositionHiringPriorities,
  companyPositionSalaryPeriods,
  companyPositionStatuses,
  type CompanyPosition,
} from "@/lib/company-data";
import { createClient } from "@/lib/supabase/client";

type CompanyTreeManagerProps = {
  canManagePositions: boolean;
  canViewCompensation: boolean;
  employeeOptions: CurrentEmployeeOption[];
  initialPositions: CompanyTreePosition[];
};

export type CurrentEmployeeOption = {
  user_id: string;
  legal_name: string | null;
  display_name: string | null;
  email: string | null;
  phone: string | null;
  profile_status: string | null;
};

export type CompanyTreePosition = CompanyPosition & {
  assigned_employee_name: string | null;
  assigned_employee_email: string | null;
  assigned_employee_phone: string | null;
};

type PositionStatusFilter = "All" | (typeof companyPositionStatuses)[number];
type OrgMapMode = "chart" | "list";

type PositionNode = CompanyTreePosition & {
  children: PositionNode[];
  matchesFilter: boolean;
};

function cleanNumber(value: FormDataEntryValue | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function getStatusClass(status: string) {
  return status.toLowerCase().replaceAll(" ", "-");
}

function formatSalary(position: CompanyPosition) {
  if (!position.salary_min && !position.salary_max) {
    return "Compensation not set";
  }

  const formatter = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
    style: "currency",
    currency: "USD",
  });
  const low = position.salary_min ? formatter.format(position.salary_min) : null;
  const high = position.salary_max ? formatter.format(position.salary_max) : null;
  const range = low && high ? `${low} - ${high}` : low ?? high;

  return `${range}${position.salary_period ? ` ${position.salary_period.toLowerCase()}` : ""}`;
}

function getEmployeeName(employee: CurrentEmployeeOption) {
  return employee.display_name || employee.legal_name || employee.email || "Employee";
}

function getEmployeeLabel(employee: CurrentEmployeeOption) {
  const name = getEmployeeName(employee);

  return employee.email && employee.email !== name ? `${name} - ${employee.email}` : name;
}

export function CompanyTreeManager({ canManagePositions, canViewCompensation, employeeOptions, initialPositions }: CompanyTreeManagerProps) {
  const [positions, setPositions] = useState(initialPositions);
  const [message, setMessage] = useState("");
  const [statusFilter, setStatusFilter] = useState<PositionStatusFilter>("All");
  const [query, setQuery] = useState("");
  const [orgMapMode, setOrgMapMode] = useState<OrgMapMode>("chart");
  const [chartScale, setChartScale] = useState(1);
  const [collapsedPositionIds, setCollapsedPositionIds] = useState<Set<string>>(() => new Set());
  const employeesByUserId = useMemo(
    () => new Map(employeeOptions.map((employee) => [employee.user_id, employee])),
    [employeeOptions],
  );
  const sortedPositions = useMemo(
    () => [...positions].sort((a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title)),
    [positions],
  );
  const positionsById = useMemo(() => new Map(positions.map((position) => [position.id, position])), [positions]);
  const childCountByPositionId = useMemo(() => {
    const counts = new Map<string, number>();

    sortedPositions.forEach((position) => {
      if (!position.parent_position_id) {
        return;
      }

      counts.set(position.parent_position_id, (counts.get(position.parent_position_id) ?? 0) + 1);
    });

    return counts;
  }, [sortedPositions]);
  const filteredPositions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return sortedPositions.filter((position) => {
      const matchesStatus = statusFilter === "All" || position.status === statusFilter;
      const matchesQuery =
        !normalizedQuery ||
        [
          position.title,
          position.department,
          position.assigned_employee_name,
          position.assigned_employee_email,
          position.location,
          position.hiring_priority,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(normalizedQuery));

      return matchesStatus && matchesQuery;
    });
  }, [query, sortedPositions, statusFilter]);
  const visibleTree = useMemo(() => {
    const filteredIds = new Set(filteredPositions.map((position) => position.id));
    const visibleIds = new Set(filteredIds);

    filteredPositions.forEach((position) => {
      let current = position;
      const seen = new Set<string>();

      while (current.parent_position_id && !seen.has(current.parent_position_id)) {
        seen.add(current.id);
        const parent = positionsById.get(current.parent_position_id);

        if (!parent) {
          break;
        }

        visibleIds.add(parent.id);
        current = parent;
      }
    });

    const nodesById = new Map<string, PositionNode>();
    sortedPositions.forEach((position) => {
      if (!visibleIds.has(position.id)) {
        return;
      }

      nodesById.set(position.id, {
        ...position,
        children: [],
        matchesFilter: filteredIds.has(position.id),
      });
    });

    const roots: PositionNode[] = [];
    sortedPositions.forEach((position) => {
      const node = nodesById.get(position.id);

      if (!node) {
        return;
      }

      const parent = position.parent_position_id ? nodesById.get(position.parent_position_id) : null;

      if (parent && parent.id !== node.id) {
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    });

    return roots;
  }, [filteredPositions, positionsById, sortedPositions]);
  const filterTabs: PositionStatusFilter[] = ["All", ...companyPositionStatuses];
  const chartScaleLabel = `${Math.round(chartScale * 100)}%`;

  function adjustChartScale(direction: "in" | "out") {
    setChartScale((current) => {
      const next = direction === "in" ? current + 0.1 : current - 0.1;

      return Math.min(1.3, Math.max(0.7, Number(next.toFixed(1))));
    });
  }

  function resetChartView() {
    setChartScale(1);
    setCollapsedPositionIds(new Set());
  }

  function toggleChartNode(positionId: string) {
    setCollapsedPositionIds((current) => {
      const next = new Set(current);

      if (next.has(positionId)) {
        next.delete(positionId);
      } else {
        next.add(positionId);
      }

      return next;
    });
  }

  function getEmployeeAssignmentPatch(selectedUserId: string) {
    return {
      portal_user_id: employeesByUserId.get(selectedUserId)?.user_id ?? null,
    };
  }

  function getAssignedEmployeeFields(selectedUserId: string) {
    const selectedEmployee = employeesByUserId.get(selectedUserId);

    return {
      assigned_employee_name: selectedEmployee ? getEmployeeName(selectedEmployee) : null,
      assigned_employee_email: selectedEmployee?.email ?? null,
      assigned_employee_phone: selectedEmployee?.phone ?? null,
    };
  }

  function buildCompanyTreePosition(position: CompanyPosition, selectedUserId = position.portal_user_id ?? ""): CompanyTreePosition {
    return {
      ...position,
      ...getAssignedEmployeeFields(selectedUserId),
    };
  }

  function renderEmployeeSelect(id: string, defaultValue: string) {
    return (
      <select id={id} name="portal_user_id" defaultValue={defaultValue} disabled={!canManagePositions}>
        <option value="">Unassigned</option>
        {employeeOptions.map((employee) => (
          <option key={employee.user_id} value={employee.user_id}>
            {getEmployeeLabel(employee)}
          </option>
        ))}
      </select>
    );
  }

  async function createPosition(formData: FormData) {
    setMessage("");
    const supabase = createClient();
    if (!supabase || !canManagePositions) {
      setMessage("Admin access and Supabase are required to manage positions.");
      return;
    }

    const selectedUserId = String(formData.get("portal_user_id") ?? "");
    const payload: Partial<CompanyPosition> & {
      department: string;
      sort_order: number;
      status: string;
      title: string;
    } = {
      title: String(formData.get("title") ?? "").trim(),
      department: String(formData.get("department") ?? "Operations"),
      parent_position_id: String(formData.get("parent_position_id") ?? "") || null,
      status: String(formData.get("status") ?? "Needed"),
      ...getEmployeeAssignmentPatch(selectedUserId),
      job_description: String(formData.get("job_description") ?? "").trim() || null,
      employment_type: String(formData.get("employment_type") ?? "Full-time"),
      location: String(formData.get("location") ?? "").trim() || null,
      hiring_priority: String(formData.get("hiring_priority") ?? "Medium"),
      sort_order: Number(formData.get("sort_order") ?? 100),
      notes: String(formData.get("notes") ?? "").trim() || null,
    };

    if (canViewCompensation) {
      payload.salary_min = cleanNumber(formData.get("salary_min"));
      payload.salary_max = cleanNumber(formData.get("salary_max"));
      payload.salary_period = String(formData.get("salary_period") ?? "Annual");
    }

    if (!payload.title) {
      setMessage("Position title is required.");
      return;
    }

    const { data, error } = await supabase.from("company_positions").insert(payload).select("*").single();
    if (error) {
      setMessage(error.message);
      return;
    }

    if (data) {
      setPositions((current) => [...current, buildCompanyTreePosition(data as CompanyPosition, selectedUserId)]);
      setMessage("Position added.");
    }
  }

  async function updatePosition(position: CompanyTreePosition, formData: FormData) {
    setMessage("");
    const supabase = createClient();
    if (!supabase || !canManagePositions) {
      setMessage("Admin access and Supabase are required to manage positions.");
      return;
    }

    const selectedUserId = String(formData.get("portal_user_id") ?? "");
    const patch: Partial<CompanyPosition> = {
      status: String(formData.get("status") ?? position.status),
      ...getEmployeeAssignmentPatch(selectedUserId),
      job_description: String(formData.get("job_description") ?? "").trim() || null,
      employment_type: String(formData.get("employment_type") ?? position.employment_type ?? "Full-time"),
      location: String(formData.get("location") ?? "").trim() || null,
      hiring_priority: String(formData.get("hiring_priority") ?? position.hiring_priority ?? "Medium"),
      notes: String(formData.get("notes") ?? "").trim() || null,
    };

    if (canViewCompensation) {
      patch.salary_min = cleanNumber(formData.get("salary_min"));
      patch.salary_max = cleanNumber(formData.get("salary_max"));
      patch.salary_period = String(formData.get("salary_period") ?? position.salary_period ?? "Annual");
    }

    const { data, error } = await supabase.from("company_positions").update(patch).eq("id", position.id).select("*").single();
    if (error) {
      setMessage(error.message);
      return;
    }

    if (data) {
      setPositions((current) =>
        current.map((item) =>
          item.id === position.id ? buildCompanyTreePosition(data as CompanyPosition, selectedUserId) : item,
        ),
      );
      setMessage("Position updated.");
    }
  }

  function renderPositionNode(position: PositionNode) {
    const reportsTo = position.parent_position_id ? positionsById.get(position.parent_position_id)?.title : null;
    const isHiringRole = position.status === "Open" || position.status === "Needed";
    const directReportCount = childCountByPositionId.get(position.id) ?? 0;
    const employeeSelectDefault = position.portal_user_id ?? "";

    return (
      <li className="org-tree-item" key={position.id}>
        <article className={`position-card org-node-card ${position.matchesFilter ? "" : "org-node-context"}`}>
          <div className="position-card-header">
            <div>
              <div className="position-title-line">
                <h3>{position.title}</h3>
                <span className={`status-pill status-${getStatusClass(position.status)}`}>{position.status}</span>
              </div>
              <p>
                {position.department}
                {reportsTo ? ` - Reports to ${reportsTo}` : " - Top level"}
              </p>
            </div>
            <span className={`priority-pill priority-${(position.hiring_priority ?? "Medium").toLowerCase()}`}>
              {position.hiring_priority ?? "Medium"}
            </span>
          </div>
          <div className="org-node-facts">
            <span>
              <Users size={15} />
              {position.assigned_employee_name || (isHiringRole ? "Hiring needed" : "Unassigned")}
            </span>
            <span>
              <BriefcaseBusiness size={15} />
              {position.employment_type || "Employment type not set"}
            </span>
            <span>
              <MapPin size={15} />
              {position.location || "Location not set"}
            </span>
            <span>
              <NetworkCount count={directReportCount} />
              {directReportCount} direct report{directReportCount === 1 ? "" : "s"}
            </span>
            {canViewCompensation ? (
              <span>
                <CircleDollarSign size={15} />
                {formatSalary(position)}
              </span>
            ) : null}
          </div>
          {position.job_description ? (
            <p className="org-node-brief">{position.job_description}</p>
          ) : null}
          <details className="position-edit-drawer">
            <summary>
              <span>{canManagePositions ? "Edit role details" : "View role details"}</span>
              <ChevronDown size={16} />
            </summary>
            <div className="position-detail-grid position-contact-grid">
              <span>
                <Mail size={15} />
                {position.assigned_employee_email || "No email"}
              </span>
              <span>
                <Phone size={15} />
                {position.assigned_employee_phone || "No phone"}
              </span>
            </div>
            <form action={(formData) => updatePosition(position, formData)} className="position-editor">
              <div className="form-grid">
                <div className="field">
                  <label>Status</label>
                  <select name="status" defaultValue={position.status} disabled={!canManagePositions}>
                    {companyPositionStatuses.map((status) => (
                      <option key={status}>{status}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Employee</label>
                  {renderEmployeeSelect(`employee-${position.id}`, employeeSelectDefault)}
                </div>
                {canViewCompensation ? (
                  <>
                    <div className="field">
                      <label>Salary min</label>
                      <input name="salary_min" defaultValue={position.salary_min ?? ""} disabled={!canManagePositions} min="0" type="number" />
                    </div>
                    <div className="field">
                      <label>Salary max</label>
                      <input name="salary_max" defaultValue={position.salary_max ?? ""} disabled={!canManagePositions} min="0" type="number" />
                    </div>
                    <div className="field">
                      <label>Salary period</label>
                      <select name="salary_period" defaultValue={position.salary_period ?? "Annual"} disabled={!canManagePositions}>
                        {companyPositionSalaryPeriods.map((period) => (
                          <option key={period}>{period}</option>
                        ))}
                      </select>
                    </div>
                  </>
                ) : null}
                <div className="field">
                  <label>Employment type</label>
                  <select name="employment_type" defaultValue={position.employment_type ?? "Full-time"} disabled={!canManagePositions}>
                    {companyPositionEmploymentTypes.map((type) => (
                      <option key={type}>{type}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Priority</label>
                  <select name="hiring_priority" defaultValue={position.hiring_priority ?? "Medium"} disabled={!canManagePositions}>
                    {companyPositionHiringPriorities.map((priority) => (
                      <option key={priority}>{priority}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Location</label>
                  <input name="location" defaultValue={position.location ?? ""} disabled={!canManagePositions} />
                </div>
                <div className="field-full">
                  <label>Job description</label>
                  <textarea name="job_description" defaultValue={position.job_description ?? ""} disabled={!canManagePositions} />
                </div>
                <div className="field-full">
                  <label>Notes</label>
                  <textarea name="notes" defaultValue={position.notes ?? ""} disabled={!canManagePositions} />
                </div>
              </div>
              <button className="button button-light" disabled={!canManagePositions} type="submit">
                <Save size={16} />
                Save
              </button>
            </form>
          </details>
        </article>
        {position.children.length > 0 ? <ul className="org-tree-children">{position.children.map((child) => renderPositionNode(child))}</ul> : null}
      </li>
    );
  }

  function renderChartNode(position: PositionNode) {
    const reportsTo = position.parent_position_id ? positionsById.get(position.parent_position_id)?.title : null;
    const isHiringRole = position.status === "Open" || position.status === "Needed";
    const directReportCount = childCountByPositionId.get(position.id) ?? 0;
    const hasChildren = position.children.length > 0;
    const isCollapsed = collapsedPositionIds.has(position.id);

    return (
      <li className="org-chart-item" key={position.id}>
        <div className="org-chart-node-shell">
          <article className={`org-chart-card ${position.matchesFilter ? "" : "org-chart-context"}`}>
            <div className="org-chart-card-top">
              <div>
                <span className="org-chart-department">{position.department}</span>
                <h3>{position.title}</h3>
              </div>
              {hasChildren ? (
                <button
                  aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${position.title}`}
                  className="icon-button org-chart-toggle"
                  onClick={() => toggleChartNode(position.id)}
                  title={`${isCollapsed ? "Expand" : "Collapse"} ${position.title}`}
                  type="button"
                >
                  <ChevronDown className={isCollapsed ? "collapsed" : ""} size={16} />
                </button>
              ) : null}
            </div>
            <div className="org-chart-status-row">
              <span className={`status-pill status-${getStatusClass(position.status)}`}>{position.status}</span>
              <span className={`priority-pill priority-${(position.hiring_priority ?? "Medium").toLowerCase()}`}>
                {position.hiring_priority ?? "Medium"}
              </span>
            </div>
            <div className="org-chart-assignee">
              <Users size={15} />
              <span>{position.assigned_employee_name || (isHiringRole ? "Hiring needed" : "Unassigned")}</span>
            </div>
            <div className="org-chart-meta">
              <span>{reportsTo ? `Reports to ${reportsTo}` : "Top level"}</span>
              <span>
                {directReportCount} report{directReportCount === 1 ? "" : "s"}
              </span>
              <span>{position.location || "Location not set"}</span>
            </div>
          </article>
        </div>
        {hasChildren && !isCollapsed ? <ul className="org-chart-children">{position.children.map((child) => renderChartNode(child))}</ul> : null}
      </li>
    );
  }

  return (
    <div className="company-tree-layout">
      <form action={createPosition} className="form-panel company-tree-add">
        <div className="panel-heading compact-heading">
          <div>
            <div className="eyebrow">New role</div>
            <h2>Add position</h2>
          </div>
        </div>
        {message ? <div className="success-box">{message}</div> : null}
        <div className="form-grid add-position-grid">
          <div className="field">
            <label htmlFor="title">Title</label>
            <input id="title" name="title" disabled={!canManagePositions} required />
          </div>
          <div className="field">
            <label htmlFor="department">Department</label>
            <select id="department" name="department" disabled={!canManagePositions}>
              {companyPositionDepartments.map((department) => (
                <option key={department}>{department}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="parent_position_id">Reports to</label>
            <select id="parent_position_id" name="parent_position_id" disabled={!canManagePositions} defaultValue="">
              <option value="">Top level</option>
              {sortedPositions.map((position) => (
                <option key={position.id} value={position.id}>
                  {position.title}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="status">Status</label>
            <select id="status" name="status" disabled={!canManagePositions} defaultValue="Needed">
              {companyPositionStatuses.map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="portal_user_id">Employee</label>
            {renderEmployeeSelect("portal_user_id", "")}
          </div>
          {canViewCompensation ? (
            <>
              <div className="field">
                <label htmlFor="salary_min">Salary min</label>
                <input id="salary_min" name="salary_min" disabled={!canManagePositions} min="0" type="number" />
              </div>
              <div className="field">
                <label htmlFor="salary_max">Salary max</label>
                <input id="salary_max" name="salary_max" disabled={!canManagePositions} min="0" type="number" />
              </div>
              <div className="field">
                <label htmlFor="salary_period">Salary period</label>
                <select id="salary_period" name="salary_period" disabled={!canManagePositions}>
                  {companyPositionSalaryPeriods.map((period) => (
                    <option key={period}>{period}</option>
                  ))}
                </select>
              </div>
            </>
          ) : null}
          <div className="field">
            <label htmlFor="employment_type">Employment type</label>
            <select id="employment_type" name="employment_type" disabled={!canManagePositions}>
              {companyPositionEmploymentTypes.map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="hiring_priority">Priority</label>
            <select id="hiring_priority" name="hiring_priority" disabled={!canManagePositions}>
              {companyPositionHiringPriorities.map((priority) => (
                <option key={priority}>{priority}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="location">Location</label>
            <input id="location" name="location" disabled={!canManagePositions} />
          </div>
          <div className="field">
            <label htmlFor="sort_order">Sort order</label>
            <input id="sort_order" name="sort_order" defaultValue={100} disabled={!canManagePositions} min="1" type="number" />
          </div>
          <div className="field">
            <label htmlFor="job_description">Job description</label>
            <textarea id="job_description" name="job_description" disabled={!canManagePositions} />
          </div>
          <div className="field">
            <label htmlFor="notes">Notes</label>
            <textarea id="notes" name="notes" disabled={!canManagePositions} />
          </div>
          <button className="button button-primary" disabled={!canManagePositions} type="submit">
            <UserPlus size={18} />
            Add Position
          </button>
        </div>
      </form>

      <section className="position-tree">
        <div className="position-tree-toolbar">
          <div>
            <div className="eyebrow">Org map</div>
            <h2>{filteredPositions.length} visible position{filteredPositions.length === 1 ? "" : "s"}</h2>
          </div>
          <div className="position-tools">
            <div className="search-field company-tree-search">
              <Search size={16} />
              <input
                aria-label="Search positions"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search roles"
                type="search"
                value={query}
              />
            </div>
            <div className="org-map-controls">
              <div className="segmented-control org-map-view-toggle" aria-label="Choose org map view">
                <button
                  className={orgMapMode === "chart" ? "active" : ""}
                  onClick={() => setOrgMapMode("chart")}
                  title="Chart view"
                  type="button"
                >
                  <ChartNetwork size={15} />
                  Chart
                </button>
                <button
                  className={orgMapMode === "list" ? "active" : ""}
                  onClick={() => setOrgMapMode("list")}
                  title="List view"
                  type="button"
                >
                  <ListTree size={15} />
                  List
                </button>
              </div>
              <div className="org-chart-zoom-controls" aria-label="Org chart zoom controls">
                <button
                  aria-label="Zoom out"
                  className="icon-button"
                  disabled={chartScale <= 0.7}
                  onClick={() => adjustChartScale("out")}
                  title="Zoom out"
                  type="button"
                >
                  <ZoomOut size={16} />
                </button>
                <span>{chartScaleLabel}</span>
                <button
                  aria-label="Zoom in"
                  className="icon-button"
                  disabled={chartScale >= 1.3}
                  onClick={() => adjustChartScale("in")}
                  title="Zoom in"
                  type="button"
                >
                  <ZoomIn size={16} />
                </button>
                <button aria-label="Reset chart" className="icon-button" onClick={resetChartView} title="Reset chart" type="button">
                  <RotateCcw size={16} />
                </button>
              </div>
            </div>
            <div className="segmented-control" aria-label="Filter positions by status">
              {filterTabs.map((status) => (
                <button
                  className={statusFilter === status ? "active" : ""}
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  type="button"
                >
                  {status}
                </button>
              ))}
            </div>
          </div>
        </div>

        {visibleTree.length > 0 && orgMapMode === "chart" ? (
          <div className="org-chart-viewport">
            <div className="org-chart-canvas" style={{ transform: `scale(${chartScale})` }}>
              <ul className="org-chart-roots">{visibleTree.map((position) => renderChartNode(position))}</ul>
            </div>
          </div>
        ) : null}
        {visibleTree.length > 0 && orgMapMode === "list" ? (
          <ul className="org-tree-root">{visibleTree.map((position) => renderPositionNode(position))}</ul>
        ) : null}
        {filteredPositions.length === 0 ? (
          <div className="empty-state">No positions match the current search and status filter.</div>
        ) : null}
      </section>
    </div>
  );
}

function NetworkCount({ count }: { count: number }) {
  return <span aria-hidden="true" className={count > 0 ? "direct-report-dot active" : "direct-report-dot"} />;
}
