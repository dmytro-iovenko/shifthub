import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Typography, Box, Tabs, Tab } from "@mui/material";
import { Application } from "../types/Application";
import {
  createDeployment,
  createDeploymentFromYaml,
  deleteDeployment,
  fetchApplicationBySlug,
  updateDeployment,
} from "../services/api";
import { useNotification } from "../context/NotificationContext";
import Loader from "../components/Loader";
// import ApplicationInfo from "../components/applications/ApplicationInfo";
import { PageContainer } from "@toolpad/core";
import TableWrapper from "../components/TableWrapper";
import { Deployment } from "../types/Deployment";
import ManagedDialogs from "../components/ManagedDialogs";
import DrawerWithForm from "../components/DrawerWithForm";
import DeploymentForm from "../components/deployments/DeploymentForm";

/**
 * Renders detailed information about the application.
 * @returns {JSX.Element} The rendered component.
 */
const ApplicationDetails: React.FC<{}> = (): JSX.Element => {
  const { slug } = useParams<{ slug: string }>();
  // const { setBreadcrumbs } = useBreadcrumbs();
  const { addNotification } = useNotification();
  const [application, setApplication] = useState<Application | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [deployments, setDeployments] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState(0);
  const [loading, setLoading] = useState(true);
  const [openForm, setOpenForm] = useState(false);
  const [currentDeployment, setCurrentDeployment] = useState<Deployment | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [selectedAppId, setSelectedAppId] = useState("");

  /**
   * Fetches application details and deployments when the component mounts.
   */
  useEffect(() => {
    let isMounted = true;
    const getApplication = async () => {
      try {
        const app = await fetchApplicationBySlug(slug!);
        const deps = app.deployments;

        if (isMounted) {
          const uniqueAppIds = new Set<string>();
          const appsMap: Record<string, Application> = {};

          deps.forEach((dep) => {
            if (!uniqueAppIds.has(dep.applicationId)) {
              uniqueAppIds.add(dep.applicationId);
              appsMap[dep.applicationId] = dep.application;
            }
          });
          setApplication(app);
          setApplications(Object.values(appsMap));
          setDeployments(deps);
        }
      } catch (error) {
        console.error("Failed to fetch application details:", error);
        addNotification("Failed to fetch application details.", "error");
      } finally {
        setLoading(false);
        setOpenForm(false);
        setCurrentDeployment(null);
        setSelectedAppId("");
      }
    };
    getApplication();

    return () => {
      isMounted = false;
    };
  }, [slug]);

  /**
   * Handles tab change event.
   **/
  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  };

  /**
   * Handles form submission for both adding and editing deployments.
   * @param {Object} data - The deployment data submitted from the form.
   * @returns {Promise<void>} A promise that resolves when the operation is complete.
   */
  const handleFormSubmit = async (
    data:
      | {
          appId: string;
          name: string;
          image: string;
          replicas: number;
          paused: boolean;
          envVars: { name: string; value: string }[];
          strategy: string;
          maxUnavailable: string;
          maxSurge: string;
        }
      | { appId: string; yaml: string }
  ) => {
    try {
      if (currentDeployment) {
        // Update existing deployment
        const updatedDeployment =
          "yaml" in data
            ? await createDeploymentFromYaml({
                applicationId: currentDeployment.application._id,
                yamlDefinition: data.yaml,
              })
            : await updateDeployment(currentDeployment._id, data);
        setDeployments(deployments.map((depl) => (depl._id === currentDeployment._id ? updatedDeployment : depl)));
        addNotification("Deployment updated successfully!", "success");
      } else {
        // Create a new deployment
        const newDeployment =
          "yaml" in data
            ? await createDeploymentFromYaml({ applicationId: data.appId, yamlDefinition: data.yaml })
            : await createDeployment({ applicationId: data.appId, ...data });
        console.log("New deployment:", newDeployment);
        setDeployments([...deployments, newDeployment]);
        addNotification("Deployment created successfully!", "success");
      }
    } catch (error) {
      console.error("Error during deployment submission:", error);
      addNotification("Error saving deployment. Please try again.", "error");
    }
  };
  /**
   * Handles the request to close the form when clicking on drawer overlay.
   * If there are unsaved changes, a confirmation dialog is shown.
   * @param {function} showDialog - Function to show a dialog.
   */
  const handleClose = (showDialog: (dialogType: string, confirmCallback: () => void) => void) => {
    if (hasUnsavedChanges) {
      showDialog("confirmClose", () => {
        setHasUnsavedChanges(false);
        handleCloseForm(true);
      });
    } else {
      handleCloseForm();
    }
  };

  /**
   * Closes the form and resets state variables.
   * @param {boolean} forceClose - Whether to force close the form without checking for unsaved changes.
   */
  const handleCloseForm = (forceClose: boolean = false) => {
    if (hasUnsavedChanges && !forceClose) return;
    setOpenForm(false);
    setCurrentDeployment(null);
    setSelectedAppId("");
  };

  if (loading) {
    return <Loader />;
  }

  if (!application) {
    return <Typography variant="h6">Application not found</Typography>;
  }

  // Define columns and data for the deployments table
  const columns = [
    { id: "name", label: "Deployment Name" },
    { id: "status", label: "Status" },
    { id: "availability", label: "Availability" },
    { id: "labels", label: "Labels" },
    { id: "age", label: "Age" },
  ];

  // Map deployment data to table rows
  const data: any = deployments.map((d) => ({
    id: d._id,
    name: d.name,
    status: `${d.availableReplicas} of ${d.replicas} pods`,
    availability: d.availableReplicas > 0 ? "Available" : "Not Available",
    labels: Object.entries(d.labels).map(([key, value]) => `${key}=${value}`),
    createdAt: d.createdAt,
  }));

  /**
   * Handles row actions for the deployments table.
   * @param {string} action - The action to perform (e.g., edit, delete).
   * @param {string} id - The ID of the deployment to act upon.
   */
  const handleRowAction = async (action: string, id: string) => {
    if (action === "edit") {
      const deployment = deployments.find((d) => d._id === id);
      // Handle edit
      setSelectedAppId(application._id);
      setCurrentDeployment(deployment);
      setOpenForm(true);
    } else if (action === "delete") {
      try {
        if (id) {
          await deleteDeployment(id);
          setDeployments(deployments.filter((depl) => depl._id !== id));
          addNotification("Deployment deleted successfully!", "success");
        } else {
          addNotification("No deployment ID provided for deletion.", "error");
        }
      } catch (error) {
        console.error("Delete failed:", error);
        addNotification("Failed to delete deployment. Please try again.", "error");
      }
    } else if (action === "refresh") {
      // Handle refresh
    }
  };

  // Define breadcrumbs for the page
  const breadcrumbs = [
    { path: `/applications`, title: "Applications" },
    { path: `/applications/${slug}`, title: `${application.name}` },
  ];

  return (
    <PageContainer title={application.name} breadcrumbs={breadcrumbs}>
      <ManagedDialogs itemType="deployment">
        {(showDialog) => (
          <>
            <Typography gutterBottom>{application.description}</Typography>
            <Tabs value={activeTab} onChange={handleTabChange}>
              {/* <Tab label="Basic Info" /> */}
              <Tab label="Deployments" />
            </Tabs>
            <Box sx={{ mt: 2 }}>
              {/* {activeTab === 0 && <ApplicationInfo application={application} />} */}
              {activeTab === 0 && (
                <>
                  <TableWrapper
                    columns={columns}
                    data={data}
                    onRowAction={handleRowAction}
                    rowActions={{ edit: "edit", delete: "delete", refresh: "refresh" }}
                    initialOrder="asc"
                    initialOrderBy="name"
                    rowsPerPage={10}
                  />

                  <DrawerWithForm
                    open={openForm}
                    onClose={() => handleClose(showDialog)}
                    formComponent={
                      <DeploymentForm
                        open={openForm}
                        onClose={handleCloseForm}
                        onSubmit={handleFormSubmit}
                        initialData={
                          currentDeployment
                            ? {
                                name: currentDeployment.name,
                                image: currentDeployment.image,
                                replicas: currentDeployment.replicas,
                                paused: currentDeployment.paused || false,
                                envVars: currentDeployment.envVars.map((envVar) => ({
                                  name: envVar.name,
                                  value: envVar.value,
                                })),
                                strategy: currentDeployment.strategy,
                                maxUnavailable: currentDeployment.maxUnavailable,
                                maxSurge: currentDeployment.maxSurge,
                                yaml: "",
                              }
                            : undefined
                        }
                        applications={applications}
                        selectedAppId={selectedAppId}
                        setSelectedAppId={setSelectedAppId}
                        isEditMode={!!currentDeployment}
                        setHasUnsavedChanges={setHasUnsavedChanges}
                        hasUnsavedChanges={hasUnsavedChanges}
                        showDialog={showDialog}
                      />
                    }
                  />
                </>
              )}
            </Box>
          </>
        )}
      </ManagedDialogs>
    </PageContainer>
  );
};

export default ApplicationDetails;
