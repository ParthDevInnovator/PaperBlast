"use client"

import { useState, useCallback } from "react"
import {
    useReactTable,
    getCoreRowModel,
    getFilteredRowModel,
    flexRender,
    type ColumnDef,
    type RowData,
} from "@tanstack/react-table"
import {
    updateQuestionAction,
    toggleVerifiedAction,
    deleteQuestionAction,
} from "@/app/dashboard/review/[id]/actions"

declare module "@tanstack/react-table" {
    interface TableMeta<TData extends RowData> {
        updateData: (questionId: string, columnId: string, value: string) => void
    }
}

type Question = {
    id: string
    subject: string
    questionType: string
    questionText: string
    correctAnswer: string
    solutionText: string | null
    isVerified: boolean
}

function EditableCell({
    getValue,
    row,
    column,
    table,
}: {
    getValue: () => unknown
    row: any
    column: any
    table: any
}) {
    const initialValue = getValue() as string
    const [value, setValue] = useState(initialValue)
    const [isSaving, setIsSaving] = useState(false)

    const onBlur = async () => {
        if (value === initialValue) return
        setIsSaving(true)
        table.options.meta?.updateData(row.original.id, column.id, value)
        await updateQuestionAction(row.original.id, { [column.id]: value })
        setIsSaving(false)
    }

    return (
        <div className="relative">
            <textarea
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onBlur={onBlur}
                rows={3}
                className="w-full bg-transparent text-sm text-foreground resize-none border-0 focus:outline-none focus:ring-1 focus:ring-ring rounded p-1 min-w-[200px]"
            />
            {isSaving && (
                <span className="absolute bottom-1 right-1 text-xs text-muted-foreground animate-pulse">saving...</span>
            )}
        </div>
    )
}

function SelectCell({
    getValue,
    row,
    column,
    table,
    options,
}: {
    getValue: () => unknown
    row: any
    column: any
    table: any
    options: string[]
}) {
    const initialValue = getValue() as string
    const [value, setValue] = useState(initialValue)

    const onChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newVal = e.target.value
        setValue(newVal)
        table.options.meta?.updateData(row.original.id, column.id, newVal)
        await updateQuestionAction(row.original.id, { [column.id]: newVal })
    }

    return (
        <select
            value={value}
            onChange={onChange}
            className="bg-secondary text-secondary-foreground text-sm rounded px-2 py-1 border border-border focus:outline-none focus:ring-1 focus:ring-ring"
        >
            {options.map((opt) => (
                <option key={opt} value={opt}>
                    {opt}
                </option>
            ))}
        </select>
    )
}

export function ReviewTable({
    questions: initialQuestions,
    paperId,
}: {
    questions: Question[]
    paperId: string
}) {
    const [questions, setQuestions] = useState(initialQuestions)
    const [globalFilter, setGlobalFilter] = useState("")
    const [filterType, setFilterType] = useState<"ALL" | "LOW" | "UNVERIFIED">("ALL")

    const updateData = useCallback(
        (questionId: string, columnId: string, value: string) => {
            setQuestions((old) =>
                old.map((row) =>
                    row.id === questionId ? { ...row, [columnId]: value } : row
                )
            )
        },
        []
    )

    // We actually need to fix `updateData`: react-table's rowIndex refers to the currently displayed sorted/filtered array.
    // It's better to update by question ID, but updateData is called from editable cell which gives original index...
    // Actually, Meta options allows passing rowId instead. Or we just keep it simple, but wait...
    // If I filter `data: filteredQuestions`, rowIndex will be wrong. 

    // Better to filter using TanStack's built-in hooks or simply apply filter to the `data` but `rowIndex` mapping will break.
    // Let's modify `EditableCell` and `SelectCell` later?

    const handleToggleVerified = async (questionId: string, current: boolean) => {
        await toggleVerifiedAction(questionId, current)
        setQuestions((old) =>
            old.map((q) => (q.id === questionId ? { ...q, isVerified: !current } : q))
        )
    }

    const handleDelete = async (questionId: string) => {
        if (!confirm("Delete this question?")) return
        await deleteQuestionAction(questionId)
        setQuestions((old) => old.filter((q) => q.id !== questionId))
    }

    const filteredQuestions = questions.filter(q => {
        if (filterType === "LOW") return q.questionText?.includes("[LOW CONFIDENCE]") || q.solutionText?.includes("[LOW CONFIDENCE]");
        if (filterType === "UNVERIFIED") return !q.isVerified;
        return true;
    });

    const columns: ColumnDef<Question>[] = [
        {
            id: "rowNum",
            header: "#",
            size: 40,
            cell: ({ row }) => (
                <span className="text-xs text-muted-foreground font-mono">{row.index + 1}</span>
            ),
        },
        {
            accessorKey: "subject",
            header: "Subject",
            size: 120,
            cell: (props) => (
                <SelectCell
                    {...props}
                    options={["PHYSICS", "CHEMISTRY", "MATHEMATICS"]}
                    table={props.table}
                />
            ),
        },
        {
            accessorKey: "questionType",
            header: "Type",
            size: 100,
            cell: (props) => (
                <SelectCell
                    {...props}
                    options={["MCQ", "INTEGER"]}
                    table={props.table}
                />
            ),
        },
        {
            accessorKey: "questionText",
            header: "Question Text",
            cell: (props) => <EditableCell {...props} table={props.table} />,
        },
        {
            accessorKey: "correctAnswer",
            header: "Answer",
            size: 90,
            cell: (props) => (
                <EditableCell {...props} table={props.table} />
            ),
        },
        {
            accessorKey: "solutionText",
            header: "Solution",
            cell: (props) => <EditableCell {...props} table={props.table} />,
        },
        {
            id: "verified",
            header: "Verified",
            size: 80,
            cell: ({ row }) => (
                <button
                    onClick={() => handleToggleVerified(row.original.id, row.original.isVerified)}
                    className={`px-2 py-1 rounded-full text-xs font-bold transition-colors ${row.original.isVerified
                        ? "bg-green-500/20 text-green-400 hover:bg-green-500/30"
                        : "bg-zinc-700 text-zinc-400 hover:bg-zinc-600"
                        }`}
                >
                    {row.original.isVerified ? "✓ Yes" : "No"}
                </button>
            ),
        },
        {
            id: "confidence",
            header: "Confidence",
            size: 100,
            cell: ({ row }) => {
                const isLow = row.original.questionText?.includes("[LOW CONFIDENCE]") || row.original.solutionText?.includes("[LOW CONFIDENCE]");
                if (isLow) {
                    return (
                        <span className="px-2 py-1 bg-amber-500/10 text-amber-500 text-[10px] uppercase font-bold rounded flex items-center gap-1 w-max cursor-help" title="Low confidence — auto-extracted, please verify">
                            ⚠️ Low
                        </span>
                    );
                }
                return (
                    <span className="px-2 py-1 bg-emerald-500/10 text-emerald-500 text-[10px] uppercase font-bold rounded flex items-center gap-1 w-max">
                        ✓ High
                    </span>
                );
            }
        },
        {
            id: "actions",
            header: "",
            size: 60,
            cell: ({ row }) => (
                <button
                    onClick={() => handleDelete(row.original.id)}
                    className="text-red-500 hover:text-red-400 text-xs font-medium px-2 py-1 rounded hover:bg-red-500/10 transition-colors"
                >
                    Delete
                </button>
            ),
        },
    ]

    const table = useReactTable({
        data: questions,
        columns,
        state: { globalFilter },
        onGlobalFilterChange: setGlobalFilter,
        getCoreRowModel: getCoreRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        meta: { updateData },
    })

    const verifiedCount = questions.filter((q) => q.isVerified).length

    return (
        <div className="flex flex-col h-full">
            {/* Table toolbar */}
            <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                    <input
                        value={globalFilter}
                        onChange={(e) => setGlobalFilter(e.target.value)}
                        placeholder="Search questions..."
                        className="bg-secondary border border-border rounded-lg px-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring w-72"
                    />
                    <select
                        value={filterType}
                        onChange={(e) => setFilterType(e.target.value as any)}
                        className="bg-secondary border border-border rounded-lg px-4 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                        <option value="ALL">All Questions</option>
                        <option value="LOW">⚠️ Low Confidence</option>
                        <option value="UNVERIFIED">Unverified Only</option>
                    </select>
                </div>
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <span>
                        <span className="text-green-400 font-semibold">{verifiedCount}</span> / {questions.length} verified
                    </span>
                    <div className="w-32 h-2 bg-secondary rounded-full overflow-hidden">
                        <div
                            className="h-full bg-green-500 rounded-full transition-all"
                            style={{ width: `${questions.length > 0 ? (verifiedCount / questions.length) * 100 : 0}%` }}
                        />
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="overflow-auto rounded-xl border border-border flex-1">
                <table className="w-full text-sm border-collapse min-w-[900px]">
                    <thead className="sticky top-0 bg-card z-10">
                        {table.getHeaderGroups().map((headerGroup) => (
                            <tr key={headerGroup.id} className="border-b border-border">
                                {headerGroup.headers.map((header) => (
                                    <th
                                        key={header.id}
                                        className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap"
                                        style={{ width: header.getSize() }}
                                    >
                                        {flexRender(header.column.columnDef.header, header.getContext())}
                                    </th>
                                ))}
                            </tr>
                        ))}
                    </thead>
                    <tbody>
                        {table.getRowModel().rows.map((row, i) => (
                            <tr
                                key={row.id}
                                className={`border-b border-border/50 transition-colors hover:bg-secondary/30 ${row.original.isVerified ? "bg-green-500/5" : ""
                                    } ${i % 2 === 0 ? "" : "bg-secondary/10"}`}
                            >
                                {row.getVisibleCells().map((cell) => (
                                    <td
                                        key={cell.id}
                                        className="px-4 py-3 align-top"
                                        style={{ width: cell.column.getSize() }}
                                    >
                                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>

                {table.getRowModel().rows.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                        <p>No questions found.</p>
                    </div>
                )}
            </div>
        </div>
    )
}
