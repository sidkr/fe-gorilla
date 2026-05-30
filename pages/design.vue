<script setup>
// Design-system gallery / "kitchen sink". Renders every shared component with
// representative variants so a broken SFC surfaces at compile time and visual
// regressions are easy to eyeball. Top-level (non-/app) route → no auth needed.
import { ref } from "vue";
import { useToast } from "~/composables/shared/useToast";

useHead({
  title: "Design System",
  meta: [{ name: "robots", content: "noindex,nofollow" }],
});

// All icon names to render in a labeled grid.
const iconNames = [
  "arrow-right", "arrow-up", "arrow-down", "chevron-left", "chevron-right",
  "chevron-down", "back", "undo", "redo", "check", "x", "plus", "search",
  "filter", "upload", "download", "paper-plane", "mail", "document", "trash",
  "external-link", "copy", "warning", "info", "eye", "more-horizontal",
];

const pillTones = ["neutral", "brand", "success", "warn", "danger", "info"];

// --- Local model state -----------------------------------------------------
const text = ref("Hello");
const textInvalid = ref("not-an-email");
const textMono = ref("ACME-1024");
const area = ref("Multi-line\ncontent here.");
const selectValue = ref("b");
const checked = ref(true);
const checkedOff = ref(false);

const seg2 = ref("list");
const seg2Options = [
  { label: "List", value: "list" },
  { label: "Grid", value: "grid" },
];
const seg3 = ref("day");
const seg3Options = [
  { label: "Day", value: "day" },
  { label: "Week", value: "week" },
  { label: "Month", value: "month" },
];

const modalOpen = ref(false);

const { push } = useToast();
</script>

<template>
  <div class="ds">
    <header class="ds__top">
      <h1 class="ds__title">Design System</h1>
      <p class="ds__lede">
        Living kitchen sink — every shared component and its variants.
      </p>
    </header>

    <!-- Button -->
    <section class="ds__section">
      <h2 class="ds__heading">Button</h2>
      <div class="ds__row">
        <Button variant="primary">Primary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="danger">Danger</Button>
        <Button variant="subtle">Subtle</Button>
      </div>
      <div class="ds__row">
        <Button size="sm">Small</Button>
        <Button size="md">Medium</Button>
        <Button size="lg">Large</Button>
      </div>
      <div class="ds__row">
        <Button disabled>Disabled</Button>
        <Button loading>Loading</Button>
        <Button to="/">As link (to="/")</Button>
        <Button>
          <template #leading><Icon name="paper-plane" /></template>
          Send
        </Button>
        <Button variant="ghost">
          Next
          <template #trailing><Icon name="arrow-right" /></template>
        </Button>
      </div>
      <div class="ds__row">
        <Button block>Block button</Button>
      </div>
    </section>

    <!-- Form fields & inputs -->
    <section class="ds__section">
      <h2 class="ds__heading">Form fields & inputs</h2>
      <div class="ds__grid2">
        <FormField label="Name" hint="Your full name" required>
          <TextInput v-model="text" placeholder="Jane Doe" />
        </FormField>

        <FormField label="Email" error="That email looks invalid.">
          <TextInput v-model="textInvalid" type="email" invalid />
        </FormField>

        <FormField label="Disabled">
          <TextInput v-model="text" disabled />
        </FormField>

        <FormField label="API key" hint="Monospace input">
          <TextInput v-model="textMono" mono />
        </FormField>

        <FormField label="Small size">
          <TextInput v-model="text" size="sm" placeholder="Compact" />
        </FormField>

        <FormField label="Notes">
          <TextArea v-model="area" :rows="3" />
        </FormField>

        <FormField label="Code block">
          <TextArea v-model="area" :rows="3" mono />
        </FormField>

        <FormField label="Disabled area">
          <TextArea v-model="area" :rows="3" disabled />
        </FormField>

        <FormField label="Choose one">
          <SelectInput v-model="selectValue">
            <option value="a">Option A</option>
            <option value="b">Option B</option>
            <option value="c">Option C</option>
          </SelectInput>
        </FormField>
      </div>

      <div class="ds__row ds__row--tight">
        <Checkbox v-model="checked">Subscribed</Checkbox>
        <Checkbox v-model="checkedOff">Unchecked</Checkbox>
        <Checkbox v-model="checkedOff" disabled>Disabled</Checkbox>
      </div>
    </section>

    <!-- Pill -->
    <section class="ds__section">
      <h2 class="ds__heading">Pill</h2>
      <div class="ds__row ds__row--tight">
        <Pill v-for="t in pillTones" :key="t" :tone="t">{{ t }}</Pill>
      </div>
      <div class="ds__row ds__row--tight">
        <Pill tone="success" dot>Live</Pill>
        <Pill tone="brand" size="md">Medium</Pill>
      </div>
    </section>

    <!-- SectionEyebrow -->
    <section class="ds__section">
      <h2 class="ds__heading">SectionEyebrow</h2>
      <div class="ds__col">
        <SectionEyebrow>Overview</SectionEyebrow>
        <SectionEyebrow dotColor="var(--color-ok)">
          Status
          <template #trailing><Pill tone="success" dot>Active</Pill></template>
        </SectionEyebrow>
      </div>
    </section>

    <!-- Card -->
    <section class="ds__section">
      <h2 class="ds__heading">Card</h2>
      <div class="ds__grid3">
        <Card>
          <p class="ds__cardtext">Basic card with medium padding.</p>
        </Card>

        <Card interactive>
          <p class="ds__cardtext">Interactive card — hover for lift.</p>
        </Card>

        <Card padding="md">
          <template #header>
            <strong>Header</strong>
          </template>
          <p class="ds__cardtext">Body content sits between the rules.</p>
          <template #footer>
            <Button size="sm" variant="ghost">Footer action</Button>
          </template>
        </Card>
      </div>
    </section>

    <!-- EmptyState -->
    <section class="ds__section">
      <h2 class="ds__heading">EmptyState</h2>
      <Card flush>
        <EmptyState
          title="No campaigns yet"
          subtitle="Create your first campaign to start sending."
        >
          <template #icon><Icon name="mail" :size="32" /></template>
          <template #action>
            <Button>
              <template #leading><Icon name="plus" /></template>
              New campaign
            </Button>
          </template>
        </EmptyState>
      </Card>
    </section>

    <!-- SegmentedControl -->
    <section class="ds__section">
      <h2 class="ds__heading">SegmentedControl</h2>
      <div class="ds__row">
        <SegmentedControl
          v-model="seg2"
          :options="seg2Options"
          aria-label="View mode"
        />
        <SegmentedControl
          v-model="seg3"
          :options="seg3Options"
          aria-label="Time range"
        />
      </div>
      <p class="ds__note">Selected: {{ seg2 }} / {{ seg3 }}</p>
    </section>

    <!-- Avatar -->
    <section class="ds__section">
      <h2 class="ds__heading">Avatar</h2>
      <div class="ds__row ds__row--tight">
        <Avatar name="Jane Doe" size="sm" />
        <Avatar name="Jane Doe" size="md" />
        <Avatar name="Jane Doe" size="lg" />
      </div>
      <div class="ds__row ds__row--tight">
        <Avatar name="Brand Tone" tone="brand" />
        <Avatar name="Ok Tone" tone="success" />
        <Avatar name="Warn Tone" tone="warn" />
        <Avatar name="Danger Tone" tone="danger" />
        <Avatar name="Info Tone" tone="info" />
      </div>
    </section>

    <!-- Icon -->
    <section class="ds__section">
      <h2 class="ds__heading">Icon</h2>
      <div class="ds__icons">
        <div v-for="n in iconNames" :key="n" class="ds__icon">
          <Icon :name="n" size="lg" />
          <span class="ds__iconlabel">{{ n }}</span>
        </div>
      </div>
    </section>

    <!-- Modal -->
    <section class="ds__section">
      <h2 class="ds__heading">Modal</h2>
      <Button @click="modalOpen = true">Open modal</Button>
      <Modal v-model:open="modalOpen" title="Confirm action">
        <p>This is the modal body. It teleports to the document body and traps focus.</p>
        <template #footer>
          <Button variant="ghost" @click="modalOpen = false">Cancel</Button>
          <Button @click="modalOpen = false">Confirm</Button>
        </template>
      </Modal>
    </section>

    <!-- Popover -->
    <section class="ds__section">
      <h2 class="ds__heading">Popover</h2>
      <Popover align="start">
        <template #trigger>
          <Button variant="ghost">
            Open popover
            <template #trailing><Icon name="chevron-down" /></template>
          </Button>
        </template>
        <div class="ds__pop">
          <p class="ds__cardtext">Panel content rendered below the trigger.</p>
          <Button size="sm" block>Action</Button>
        </div>
      </Popover>
    </section>

    <!-- TableShell -->
    <section class="ds__section">
      <h2 class="ds__heading">TableShell</h2>
      <TableShell>
        <template #head>
          <th>Campaign</th>
          <th>Status</th>
          <th>Sent</th>
        </template>
        <template #body>
          <tr>
            <td>Spring Launch</td>
            <td><Pill tone="success" dot>Sent</Pill></td>
            <td>12,402</td>
          </tr>
          <tr>
            <td>Weekly Digest</td>
            <td><Pill tone="warn">Draft</Pill></td>
            <td>—</td>
          </tr>
          <tr>
            <td>Re-engagement</td>
            <td><Pill tone="info">Scheduled</Pill></td>
            <td>—</td>
          </tr>
        </template>
      </TableShell>
    </section>

    <!-- Toast -->
    <section class="ds__section">
      <h2 class="ds__heading">Toast</h2>
      <div class="ds__row">
        <Button @click="push('Saved.', { tone: 'success' })">Success toast</Button>
        <Button variant="danger" @click="push('Something went wrong.', { tone: 'danger' })">
          Danger toast
        </Button>
      </div>
    </section>

    <ToastHost />
  </div>
</template>

<style scoped>
.ds {
  max-width: 960px;
  margin: 0 auto;
  padding: var(--space-8) var(--space-5) var(--space-10);
  background: var(--color-bg);
  color: var(--color-ink);
  font-family: var(--font-body);
}

.ds__top {
  margin-bottom: var(--space-9);
}

.ds__title {
  margin: 0 0 var(--space-2);
  font-family: var(--font-display);
  font-size: var(--text-4xl);
  font-weight: 700;
  letter-spacing: var(--tracking-tight);
}

.ds__lede {
  margin: 0;
  color: var(--color-ink-dim);
  font-size: var(--text-md);
}

.ds__section {
  padding: var(--space-6) 0;
  border-top: 1px solid var(--color-rule);
}

.ds__heading {
  margin: 0 0 var(--space-5);
  font-family: var(--font-display);
  font-size: var(--text-xl);
  font-weight: 700;
}

.ds__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-4);
  margin-bottom: var(--space-4);
}

.ds__row--tight {
  gap: var(--space-3);
}

.ds__row:last-child {
  margin-bottom: 0;
}

.ds__col {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.ds__grid2 {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--space-4);
  margin-bottom: var(--space-5);
}

.ds__grid3 {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--space-4);
}

.ds__cardtext {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--color-ink-soft);
}

.ds__note {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--color-ink-dim);
}

.ds__icons {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: var(--space-3);
}

.ds__icon {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-4) var(--space-2);
  background: var(--color-surface);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-md);
  color: var(--color-ink);
}

.ds__iconlabel {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--color-ink-dim);
  text-align: center;
}

.ds__pop {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  min-width: 200px;
}
</style>
